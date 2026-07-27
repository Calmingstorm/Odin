"""Resolution and validation of the local command workspace.

User-command execution (``run_command``, ``run_script``, ``manage_process``)
used to inherit the service's working directory, which is the install root.
A bare relative path in a command therefore resolved against the live install:
on 2026-07-27 an AE2 jar whose internal layout is ``data/`` was extracted and
then cleaned up with ``rm -rf data``, deleting ``/opt/odin/data``.

This module resolves ONE validated directory that those subprocesses run in
instead. Scope is deliberately narrow:

- It changes where a *bare relative path* lands. Nothing else.
- Explicit ``cd`` still works. Absolute paths still work. ``git -C <path>``
  still works. Deliberately operating inside the install remains possible.
- It does NOT confine the process. ``..``, an absolute path, a symlink placed
  inside the workspace, or archive path traversal can still reach the install.
  Preventing those needs filesystem confinement and would cost capability;
  what this closes is the accidental basename collision that actually bit.

Validation fails CLOSED — callers raise instead of silently falling back to
the inherited cwd, because that fallback is precisely the hazard.

Protected roots are supplied by the caller and canonicalized here, never
assumed (PR #239 review): the install root is ``/app`` under Docker and an
arbitrary path for source checkouts, and packaged ``/opt/odin/data`` is a
SYMLINK to ``/var/lib/odin``, so a naive ``install / "data"`` string check
would happily accept a workspace sitting inside the real live-data directory.
Overlap is rejected in BOTH directions: a workspace that *contains* a
protected root is just as unusable as one nested inside it.
"""

from __future__ import annotations

import os
import stat
from collections.abc import Sequence
from pathlib import Path

# The accepted operational contract: a real directory owned by the execution
# identity, private, and fully usable by that owner (0700). 0300 is private
# and writable but not readable, which breaks ordinary workspace use.
REQUIRED_MODE = 0o700


class WorkspaceError(RuntimeError):
    """The configured local workspace is unusable. Never fall back to cwd."""


def _canonical(path: str | os.PathLike[str]) -> Path:
    """Fully resolved path, symlinks included — aliases must not smuggle a
    protected root past the overlap check."""
    return Path(path).expanduser().resolve(strict=False)


def _overlaps(workspace: Path, root: Path) -> bool:
    """True when the two paths are the same or either contains the other."""
    return workspace == root or root in workspace.parents or workspace in root.parents


def resolve_workspace(
    configured: str,
    *,
    protected_roots: Sequence[str | os.PathLike[str]] | None = None,
    require_owner: bool = True,
    owner_uid: int | None = None,
    create_if_missing: bool = True,
) -> Path:
    """Validate ``configured`` and return the canonical workspace path.

    ``protected_roots`` are the install root and live-data root(s) the
    workspace must not overlap. Callers derive them from the running
    application rather than relying on a hardcoded ``/opt/odin``, which is
    wrong under Docker (``/app``), for source checkouts, and for packaged
    installs where ``data`` is a symlink elsewhere.
    """
    if not configured or not str(configured).strip():
        raise WorkspaceError("tools.local_working_dir is empty")

    raw = Path(str(configured).strip()).expanduser()
    if not raw.is_absolute():
        raise WorkspaceError(f"local_working_dir must be absolute: {configured!r}")

    # Rejected before resolution: a symlink could be repointed later, silently
    # moving every command's working directory.
    if raw.is_symlink():
        raise WorkspaceError(f"local_working_dir must not be a symlink: {raw}")

    workspace = _canonical(raw)

    # Self-provision when we can. Upgrades must be seamless: a packaged install
    # gets this from systemd StateDirectory= and the postinstall, but a source
    # checkout or a git-based self-update lands on new code whose unit file was
    # never refreshed, and failing closed there would silently cost local
    # commands. Creating it is NOT the dangerous fallback — that would be
    # inheriting the install directory. Everything below still validates.
    if create_if_missing and not workspace.exists():
        try:
            workspace.mkdir(mode=REQUIRED_MODE, parents=False)
            # mkdir's mode is masked by umask; set it explicitly so a
            # self-provisioned workspace satisfies the same 0700 contract that
            # a deployment-provisioned one does.
            workspace.chmod(REQUIRED_MODE)
        except OSError:
            pass  # unwritable parent (e.g. root-owned /var/lib) — report below

    if not workspace.exists():
        raise WorkspaceError(
            f"local_working_dir does not exist and could not be created: {workspace}. "
            f"Create it as the service account, e.g. "
            f"sudo install -d -m 0700 -o odin -g odin {workspace}"
        )
    if not workspace.is_dir():
        raise WorkspaceError(f"local_working_dir is not a directory: {workspace}")

    for root in protected_roots or []:
        canonical_root = _canonical(root)
        if _overlaps(workspace, canonical_root):
            raise WorkspaceError(
                f"local_working_dir must not overlap {canonical_root}: {workspace}"
            )

    info = workspace.stat()

    if require_owner:
        expected = os.getuid() if owner_uid is None else owner_uid
        if info.st_uid != expected:
            raise WorkspaceError(
                f"local_working_dir must be owned by uid {expected}: "
                f"{workspace} is owned by uid {info.st_uid}"
            )

    mode = stat.S_IMODE(info.st_mode)
    if mode != REQUIRED_MODE:
        # Both halves matter: group/world bits leak a workspace that may hold
        # command output, and an owner mode like 0300 is private but not
        # readable, which breaks ordinary use.
        raise WorkspaceError(
            f"local_working_dir must be mode {REQUIRED_MODE:o}: {workspace} is {mode:o}"
        )

    if not os.access(workspace, os.R_OK | os.W_OK | os.X_OK):
        raise WorkspaceError(f"local_working_dir is not fully usable: {workspace}")

    return workspace


def workspace_env(workspace: Path, base: dict[str, str] | None = None) -> dict[str, str]:
    """Environment for a child shell started in ``workspace``.

    ``cwd=`` sets ``PWD`` correctly, but an inherited ``OLDPWD`` pointing at the
    install means a bare ``cd -`` walks straight back into it — a small but real
    hole in the boundary (PR #239 review). Both are normalized.
    """
    env = dict(os.environ if base is None else base)
    env["PWD"] = str(workspace)
    env["OLDPWD"] = str(workspace)
    return env
