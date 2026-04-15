"""Git operations helper for the git_ops tool.

Builds safe git commands for clone, status, diff, branch, commit, push,
log, and pull — with branch freshness checks before push.
"""

from __future__ import annotations

import shlex

ALLOWED_ACTIONS = frozenset({
    "clone", "status", "diff", "branch", "commit", "push", "log", "pull",
    "checkout", "fetch", "stash",
})

_MAX_LOG_ENTRIES = 50
_DEFAULT_LOG_ENTRIES = 20
_DEFAULT_DIFF_CONTEXT = 3


def _sq(value: str) -> str:
    return shlex.quote(value)


def build_git_command(action: str, params: dict) -> str | list[str]:
    """Build one or more shell commands for a git action.

    Returns a single command string or a list of commands to run
    sequentially (joined with &&).
    """
    if action not in ALLOWED_ACTIONS:
        raise ValueError(
            f"Unknown git action: {action}. "
            f"Allowed: {', '.join(sorted(ALLOWED_ACTIONS))}"
        )

    builder = _BUILDERS.get(action)
    if builder is None:
        raise ValueError(f"No builder for action: {action}")
    return builder(params)


def _build_clone(params: dict) -> str:
    url = params.get("url", "")
    if not url:
        raise ValueError("clone requires 'url'")
    dest = params.get("dest", "")
    branch = params.get("branch", "")
    depth = params.get("depth")

    parts = ["git", "clone"]
    if branch:
        parts += ["--branch", _sq(branch)]
    if depth is not None:
        try:
            d = int(depth)
            if d > 0:
                parts += ["--depth", str(d)]
        except (TypeError, ValueError):
            pass
    parts.append(_sq(url))
    if dest:
        parts.append(_sq(dest))
    return " ".join(parts)


def _build_status(params: dict) -> str:
    repo = params.get("repo", ".")
    return f"git -C {_sq(repo)} status --short --branch"


def _build_diff(params: dict) -> str:
    repo = params.get("repo", ".")
    target = params.get("target", "")
    staged = params.get("staged", False)
    context = params.get("context")

    parts = ["git", "-C", _sq(repo), "diff"]
    if staged:
        parts.append("--cached")
    if context is not None:
        try:
            c = int(context)
            if c >= 0:
                parts.append(f"-U{c}")
        except (TypeError, ValueError):
            pass
    if target:
        parts.append(_sq(target))
    return " ".join(parts)


def _build_branch(params: dict) -> str:
    repo = params.get("repo", ".")
    name = params.get("name", "")
    delete = params.get("delete", False)
    list_all = params.get("list", False)

    if list_all or (not name and not delete):
        return f"git -C {_sq(repo)} branch -a --no-color"
    if delete and name:
        return f"git -C {_sq(repo)} branch -d {_sq(name)}"
    if name:
        return f"git -C {_sq(repo)} branch {_sq(name)}"
    return f"git -C {_sq(repo)} branch -a --no-color"


def _build_commit(params: dict) -> str:
    repo = params.get("repo", ".")
    message = params.get("message", "")
    if not message:
        raise ValueError("commit requires 'message'")
    add_all = params.get("add_all", False)
    files = params.get("files")

    cmds = []
    if add_all:
        cmds.append(f"git -C {_sq(repo)} add -A")
    elif files:
        if isinstance(files, str):
            files = [files]
        quoted = " ".join(_sq(f) for f in files)
        cmds.append(f"git -C {_sq(repo)} add {quoted}")

    cmds.append(f"git -C {_sq(repo)} commit -m {_sq(message)}")
    return " && ".join(cmds)


def _build_push(params: dict) -> list[str]:
    """Build push commands with branch freshness check.

    Returns a list: first a fetch+freshness check, then the push.
    The caller should run the freshness check first and only push
    if the branch is up to date.
    """
    repo = params.get("repo", ".")
    remote = params.get("remote", "origin")
    branch = params.get("branch", "")
    force = params.get("force", False)
    set_upstream = params.get("set_upstream", False)

    sq_repo = _sq(repo)
    sq_remote = _sq(remote)

    freshness_script = (
        f"git -C {sq_repo} fetch {sq_remote} --quiet 2>&1 && "
        f"LOCAL=$(git -C {sq_repo} rev-parse HEAD) && "
        f"MERGE_BASE=$(git -C {sq_repo} merge-base HEAD {sq_remote}/$(git -C {sq_repo} rev-parse --abbrev-ref HEAD) 2>/dev/null || echo NONE) && "
        f"REMOTE=$(git -C {sq_repo} rev-parse {sq_remote}/$(git -C {sq_repo} rev-parse --abbrev-ref HEAD) 2>/dev/null || echo NONE) && "
        f'if [ "$REMOTE" = "NONE" ]; then echo "FRESH:no_remote_tracking"; '
        f'elif [ "$LOCAL" = "$REMOTE" ]; then echo "FRESH:up_to_date"; '
        f'elif [ "$MERGE_BASE" = "$REMOTE" ]; then echo "FRESH:ahead"; '
        f'else echo "STALE:local_behind_remote — pull or rebase first"; fi'
    )

    push_parts = ["git", "-C", sq_repo, "push"]
    if force:
        push_parts.append("--force-with-lease")
    if set_upstream:
        push_parts.append("--set-upstream")
    push_parts.append(sq_remote)
    if branch:
        push_parts.append(_sq(branch))
    push_cmd = " ".join(push_parts)

    return [freshness_script, push_cmd]


def _build_log(params: dict) -> str:
    repo = params.get("repo", ".")
    count = params.get("count", _DEFAULT_LOG_ENTRIES)
    try:
        count = min(int(count), _MAX_LOG_ENTRIES)
        if count < 1:
            count = _DEFAULT_LOG_ENTRIES
    except (TypeError, ValueError):
        count = _DEFAULT_LOG_ENTRIES

    oneline = params.get("oneline", True)
    branch = params.get("branch", "")

    parts = ["git", "-C", _sq(repo), "log", f"-{count}"]
    if oneline:
        parts.append("--oneline")
    else:
        parts.append("--format=%h %s (%an, %ar)")
    if branch:
        parts.append(_sq(branch))
    return " ".join(parts)


def _build_pull(params: dict) -> str:
    repo = params.get("repo", ".")
    remote = params.get("remote", "origin")
    branch = params.get("branch", "")
    rebase = params.get("rebase", False)

    parts = ["git", "-C", _sq(repo), "pull"]
    if rebase:
        parts.append("--rebase")
    parts.append(_sq(remote))
    if branch:
        parts.append(_sq(branch))
    return " ".join(parts)


def _build_checkout(params: dict) -> str:
    repo = params.get("repo", ".")
    target = params.get("target", "")
    if not target:
        raise ValueError("checkout requires 'target' (branch name or commit)")
    create = params.get("create", False)

    parts = ["git", "-C", _sq(repo), "checkout"]
    if create:
        parts.append("-b")
    parts.append(_sq(target))
    return " ".join(parts)


def _build_fetch(params: dict) -> str:
    repo = params.get("repo", ".")
    remote = params.get("remote", "origin")
    prune = params.get("prune", False)

    parts = ["git", "-C", _sq(repo), "fetch", _sq(remote)]
    if prune:
        parts.append("--prune")
    return " ".join(parts)


def _build_stash(params: dict) -> str:
    repo = params.get("repo", ".")
    sub = params.get("subaction", "push")

    allowed_subs = {"push", "pop", "list", "drop", "apply"}
    if sub not in allowed_subs:
        raise ValueError(f"stash subaction must be one of: {', '.join(sorted(allowed_subs))}")

    parts = ["git", "-C", _sq(repo), "stash", sub]
    if sub == "push":
        message = params.get("message", "")
        if message:
            parts += ["-m", _sq(message)]
    return " ".join(parts)


_BUILDERS = {
    "clone": _build_clone,
    "status": _build_status,
    "diff": _build_diff,
    "branch": _build_branch,
    "commit": _build_commit,
    "push": _build_push,
    "log": _build_log,
    "pull": _build_pull,
    "checkout": _build_checkout,
    "fetch": _build_fetch,
    "stash": _build_stash,
}
