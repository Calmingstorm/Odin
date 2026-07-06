"""Tool definitions — git_ops … terraform_ops (slice 8/9 of the original TOOLS order).

RFC-004 P1: verbatim positional slice. ORDER IS BEHAVIOR (the tool
catalog feeds prompt assembly) — do not reorder, and do not move
tools between sections; the characterization contract pins the
concatenated order exactly.
"""

TOOLS_SECTION: list[dict] = [
    # --- Git operations ---
    {
        "name": "git_ops",
        "is_core": True,
        "description": (
            "Git operations on a managed host. Actions: clone, status, diff, log, branch, "
            "commit, push, pull, checkout, fetch, stash. Push checks branch freshness first "
            "and refuses if local is behind remote. Use --force-with-lease (never bare --force) "
            "when force is needed. For complex multi-step git workflows, use run_script."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config",
                },
                "action": {
                    "type": "string",
                    "description": (
                        "Git action: clone, status, diff, log, branch, commit, push, pull, "
                        "checkout, fetch, stash"
                    ),
                    "enum": [
                        "clone",
                        "status",
                        "diff",
                        "log",
                        "branch",
                        "commit",
                        "push",
                        "pull",
                        "checkout",
                        "fetch",
                        "stash",
                    ],
                },
                "params": {
                    "type": "object",
                    "description": (
                        "Action-specific params. Common: repo (path, default '.'). "
                        "clone: url (required), dest, branch, depth. "
                        "diff: target, staged (bool), context (int). "
                        "log: count (int, max 50), oneline (bool), branch. "
                        "branch: name (create), delete (bool), list (bool). "
                        "commit: message (required), add_all (bool), files (array). "
                        "push: remote, branch, force (bool), set_upstream (bool). "
                        "pull: remote, branch, rebase (bool). "
                        "checkout: target (required), create (bool). "
                        "fetch: remote, prune (bool). "
                        "stash: subaction (push/pop/list/drop/apply), message."
                    ),
                },
            },
            "required": ["host", "action"],
        },
    },
    # --- Kubernetes operations ---
    {
        "name": "kubectl",
        "is_core": True,
        "description": (
            "Kubernetes operations on a managed host. Actions: get, describe, logs, apply, delete, "
            "exec, rollout, scale, top, config. Runs kubectl via SSH on the target host (or "
            "locally). "
            "Supports namespace, context, and kubeconfig overrides. For complex multi-resource "
            "workflows, "
            "use run_script."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config",
                },
                "action": {
                    "type": "string",
                    "description": (
                        "Kubectl action: get, describe, logs, apply, delete, exec, rollout, scale, "
                        "top, config"
                    ),
                    "enum": [
                        "get",
                        "describe",
                        "logs",
                        "apply",
                        "delete",
                        "exec",
                        "rollout",
                        "scale",
                        "top",
                        "config",
                    ],
                },
                "params": {
                    "type": "object",
                    "description": (
                        "Action-specific params. Common: namespace, context, kubeconfig. "
                        "get: resource (required), name, output (json/yaml/wide/name), selector, "
                        "all_namespaces (bool). "
                        "describe: resource (required), name. "
                        "logs: pod (required), container, tail (int), previous (bool), since (e.g. "
                        "'1h'), follow (bool), selector. "
                        "apply: file (path/URL, required unless kustomize), kustomize (dir), "
                        "dry_run (bool). "
                        "delete: resource (required), name, selector, force (bool), grace_period "
                        "(int). "
                        "exec: pod (required), command (required), container. "
                        "rollout: subaction (status/restart/undo/history/pause/resume), resource "
                        "(required). "
                        "scale: resource (required), replicas (required, int). "
                        "top: resource (pods/nodes), name, selector, containers (bool). "
                        "config: subaction (get-contexts/use-context/current-context/view), "
                        "context_name (for use-context)."
                    ),
                },
            },
            "required": ["host", "action"],
        },
    },
    # --- Docker operations ---
    {
        "name": "docker_ops",
        "is_core": True,
        "description": (
            "Docker operations on a managed host. Actions: ps, run, exec, logs, build, pull, "
            "stop, rm, inspect, stats, compose_up, compose_down, compose_ps, compose_logs. "
            "Runs docker/docker-compose via SSH on the target host (or locally). "
            "For complex multi-container workflows, use run_script."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config",
                },
                "action": {
                    "type": "string",
                    "description": (
                        "Docker action: ps, run, exec, logs, build, pull, stop, rm, "
                        "inspect, stats, compose_up, compose_down, compose_ps, compose_logs"
                    ),
                    "enum": [
                        "ps",
                        "run",
                        "exec",
                        "logs",
                        "build",
                        "pull",
                        "stop",
                        "rm",
                        "inspect",
                        "stats",
                        "compose_up",
                        "compose_down",
                        "compose_ps",
                        "compose_logs",
                    ],
                },
                "params": {
                    "type": "object",
                    "description": (
                        "Action-specific params. "
                        "ps: all (bool), filter (str), format (str). "
                        "run: image (required), command, name, detach (bool), rm (bool), "
                        "env (object), ports (array of 'host:container'), volumes (array), "
                        "network. "
                        "exec: container (required), command (required), workdir, env (object), "
                        "user. "
                        "logs: container (required), tail (int), since (e.g. '1h'), follow (bool), "
                        "timestamps (bool). "
                        "build: path (default '.'), tag, dockerfile, no_cache (bool), build_args "
                        "(object), target. "
                        "pull: image (required). "
                        "stop: container (required), timeout (int). "
                        "rm: container (required), force (bool), volumes (bool). "
                        "inspect: target (required, container or image name/ID), format (str). "
                        "stats: container (optional, all if omitted), no_stream (bool, default "
                        "true), format. "
                        "compose_up: services (array), detach (bool, default true), build (bool), "
                        "force_recreate (bool), file (compose file path), project (name). "
                        "compose_down: remove_volumes (bool), remove_images ('all'/'local'), file, "
                        "project. "
                        "compose_ps: services (array), format, file, project. "
                        "compose_logs: services (array), tail (int), follow (bool), timestamps "
                        "(bool), file, project."
                    ),
                },
            },
            "required": ["host", "action"],
        },
    },
    {
        "name": "terraform_ops",
        "description": (
            "Terraform operations on a managed host. Actions: init, plan, apply, output, show, "
            "validate, fmt, state, workspace, import. "
            "Apply ALWAYS requires a saved plan file (run plan with out=<file> first). "
            "-auto-approve is never used. Runs terraform via SSH on the target host (or locally)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string",
                    "description": "Host alias from config",
                },
                "action": {
                    "type": "string",
                    "description": (
                        "Terraform action: init, plan, apply, output, show, validate, "
                        "fmt, state, workspace, import"
                    ),
                    "enum": [
                        "init",
                        "plan",
                        "apply",
                        "output",
                        "show",
                        "validate",
                        "fmt",
                        "state",
                        "workspace",
                        "import",
                    ],
                },
                "params": {
                    "type": "object",
                    "description": (
                        "Action-specific params. All actions support working_dir (string, -chdir). "
                        "init: backend_config (object), upgrade (bool), reconfigure (bool), "
                        "migrate_state (bool). "
                        "plan: out (file path to save plan), destroy (bool), var (object), "
                        "var_file (str), "
                        "target (array of resource addresses), compact_warnings (bool). "
                        "apply: plan_file (REQUIRED — saved plan file from plan action). "
                        "output: name (specific output), json (bool). "
                        "show: plan_file (optional, show plan instead of state), json (bool). "
                        "validate: json (bool). "
                        "fmt: check (bool), diff (bool), recursive (bool), path (str). "
                        "state: subaction (list/show/mv/rm/pull), address, source, destination, "
                        "id. "
                        "workspace: subaction (list/select/new/delete/show), name. "
                        "import: address (REQUIRED), id (REQUIRED), var (object), var_file (str)."
                    ),
                },
            },
            "required": ["host", "action"],
        },
    },
]
