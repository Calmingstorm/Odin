"""Resolution and validation of the local command workspace.

User-command execution (``run_command``, ``run_script``, ``manage_process``)
used to inherit the service's working directory, which is the install root.
A bare relative path in a command therefore resolved against the live install:
on 2026-07-27 an AE2 jar whose internal layout is ``data/`` was extracted and
then cleaned up with ``rm -rf data``, deleting ``/opt/odin/data``.

This module resolves ONE validated directory that those subprocesses run in
instead. Scope is deliberately narrow — see :func:`resolve_workspace`:

- It changes where a *bare relative path* lands. Nothing else.
- Explicit ``cd`` still works. Absolute paths still work. ``git -C <path>``
  still works. Deliberately operating inside the install remains possible.
- It does NOT confine the process. ``..``, an absolute path, a symlink placed
  inside the workspace, or archive path traversal can still reach the install.
  Preventing those needs filesystem confinement and would cost capability;
  what this closes is the accidental basename collision that actually bit.

Validation fails CLOSED. If the configured directory is missing, is a symlink,
sits inside the install or live-data root, or is not privately owned, callers
raise instead of silently falling back to the inherited cwd — a silent
fallback would restore the exact hazard this exists to remove.
"""

from __future__ import annotations

import os
from pathlib import Path


class WorkspaceError(RuntimeError):
    """The configured local workspace is unusable. Never fall back to cwd."""


def _canonical(path: str | os.PathLike[str]) -> Path:
    return Path(path).expanduser().resolve(strict=False)


def resolve_workspace(
    configured: str,
    *,
    install_root: str | os.PathLike[str] = "/opt/odin",
    data_root: str | os.PathLike[str] | None = None,
    require_private: bool = True,
) -> Path:
    """Validate ``configured`` and return the canonical workspace path.

    Raises :class:`WorkspaceError` on anything suspect. The checks exist
    because a workspace that lives inside the install — or that is a symlink
    pointing back into it — would reopen the collision this closes.
    """
    if not configured or not str(configured).strip():
        raise WorkspaceError("tools.local_working_dir is empty")

    raw = Path(str(configured).strip()).expanduser()
    if not raw.is_absolute():
        raise WorkspaceError(f"local_working_dir must be absolute: {configured!r}")

    # A symlink is rejected before resolution: the link could be repointed
    # later, which would silently move every command's cwd.
    if raw.is_symlink():
        raise WorkspaceError(f"local_working_dir must not be a symlink: {raw}")

    workspace = _canonical(raw)
    if not workspace.exists():
        raise WorkspaceError(f"local_working_dir does not exist: {workspace}")
    if not workspace.is_dir():
        raise WorkspaceError(f"local_working_dir is not a directory: {workspace}")

    install = _canonical(install_root)
    roots = [install]
    if data_root:
        roots.append(_canonical(data_root))
    else:
        roots.append(install / "data")
    for root in roots:
        if workspace == root or root in workspace.parents:
            raise WorkspaceError(f"local_working_dir must live outside {root}: {workspace}")

    if not os.access(workspace, os.W_OK | os.X_OK):
        raise WorkspaceError(f"local_working_dir is not writable/searchable: {workspace}")

    if require_private:
        mode = workspace.stat().st_mode
        if mode & 0o077:
            raise WorkspaceError(
                f"local_working_dir must not be group/world accessible: {workspace} "
                f"(mode {mode & 0o777:o})"
            )

    return workspace


def workspace_env(workspace: Path, base: dict[str, str] | None = None) -> dict[str, str]:
    """Environment for a child shell started in ``workspace``.

    ``cwd=`` sets ``PWD`` correctly, but an inherited ``OLDPWD`` pointing at the
    install means a bare ``cd -`` walks straight back into it — a small but real
    hole in the boundary (Odin's review, 2026-07-27). Both are normalized.
    """
    env = dict(os.environ if base is None else base)
    env["PWD"] = str(workspace)
    env["OLDPWD"] = str(workspace)
    return env
