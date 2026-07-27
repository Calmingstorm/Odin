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
from types import SimpleNamespace

# The accepted operational contract: a real directory owned by the execution
# identity, private, and fully usable by that owner (0700). 0300 is private
# and writable but not readable, which breaks ordinary workspace use.
REQUIRED_MODE = 0o700

# The live working-memory file. Production wiring hardcodes this path rather
# than taking it from config, so it is defined HERE and imported there: the
# startup migration and the self-update preflight both run before (or without)
# wiring and must protect the same file the executor protects. Three
# independent spellings of "the protected roots" is exactly how round 6 found
# the updater creating a workspace beside live memory.json and reporting
# success, then handing over to an executor that refused every command.
DEFAULT_MEMORY_PATH = "./data/memory.json"


class WorkspaceError(RuntimeError):
    """The configured local workspace is unusable. Never fall back to cwd."""


def _canonical(path: str | os.PathLike[str]) -> Path:
    """Fully resolved path, symlinks included — aliases must not smuggle a
    protected root past the overlap check."""
    return Path(path).expanduser().resolve(strict=False)


def _overlaps(workspace: Path, root: Path) -> bool:
    """True when the two paths are the same or either contains the other."""
    return workspace == root or root in workspace.parents or workspace in root.parents


def _reject_overlap(
    workspace: Path, protected_roots: Sequence[str | os.PathLike[str]] | None
) -> None:
    """Raise if ``workspace`` overlaps any protected root, in either direction."""
    for root in protected_roots or []:
        canonical_root = _canonical(root)
        if _overlaps(workspace, canonical_root):
            raise WorkspaceError(
                f"local_working_dir must not overlap {canonical_root}: {workspace}"
            )


# Live-state paths declared by the FULL configuration, with their DECLARED
# file/directory semantics. Any of these can be relocated independently of the
# data directory, and a workspace overlapping one is as dangerous as a
# workspace inside ./data — round 8 reproduced a valid Config whose
# sessions.persist_directory WAS the workspace, accepted by every caller
# because only audit/trajectory/memory were protected.
#
# Deliberately excluded: tools.claude_code_dir and email.allowed_attachment_dirs
# are working directories for a tool and user-nominated source directories, not
# Odin's own state; protecting them would reject legitimate configurations.
# Paths wiring hardcodes (channel_config.json, channel_logs) sit beside
# memory.json and are covered by its parent.
_DECLARED_STATE_PATHS: tuple[tuple[str, bool], ...] = (
    ("tools.audit_log_path", True),
    ("tools.trajectory_path", False),
    ("tools.ssh_key_path", True),
    ("tools.ssh_known_hosts_path", True),
    ("tools.ssh_pool.socket_dir", False),
    ("context.directory", False),
    ("sessions.persist_directory", False),
    ("logging.directory", False),
    ("usage.directory", False),
    # Treated as a file: wiring derives its sibling fts.db via `.parent`.
    ("search.search_db_path", True),
    ("permissions.overrides_path", True),
    ("openai_codex.credentials_path", True),
    ("attachments.temp_directory", False),
)


def _active_config_roots() -> list[tuple[str, bool]]:
    """Config file paths the live process depends on, if any.

    BOTH the canonical target and the path as given on the command line: the
    self-update re-exec replays ``sys.argv``, so an aliased config
    (``/etc/odin/config.yml -> /srv/real/odin.yml``) needs its alias directory
    protected too — deleting the alias breaks the next restart even though the
    target survives (PR #239 round-10 review, reproduced).

    Imported lazily and guarded: workspace validation must never depend on the
    config module being importable, and a process that never loaded a config
    (tests, one-off scripts) has nothing to protect.
    """
    try:
        from ..config.schema import active_config_launch_path, active_config_path

        canonical = active_config_path()
        launch = active_config_launch_path()
    except Exception:  # pragma: no cover - defensive
        return []
    roots: list[tuple[str, bool]] = []
    if canonical:
        roots.append((str(canonical), True))
    if launch:
        # As a DIRECTORY: the launch path's own parent, canonicalized. Treating
        # it as a file would resolve the symlink and yield the target's
        # directory again — the alias directory is the one re-exec reopens.
        roots.append((str(Path(launch).parent), False))
    return roots


def _dotted(source: object, path: str) -> object:
    """Resolve ``a.b.c`` against nested config objects, tolerating absence."""
    current = source
    for part in path.split("."):
        current = getattr(current, part, None)
        if current is None:
            return None
    return current


def command_protected_roots(
    install_root: str | os.PathLike[str],
    config: object = None,
    *,
    tools: object = None,
    memory_path: object = DEFAULT_MEMORY_PATH,
) -> list[str]:
    """THE derivation of directories a command workspace must never overlap.

    Every caller — executor, startup migration, self-update preflight — uses
    this one function, so a workspace accepted by one is accepted by all. When
    they each derived their own, the preflight approved (and created) a
    workspace beside live memory.json that the executor then rejected.

    Pass the FULL ``config`` wherever one exists: live state is not confined to
    the data directory, and sessions, context, logs, usage, the search index,
    permissions and Codex credentials can each be relocated independently.
    ``tools`` is the reduced fallback for callers holding only a ToolsConfig
    (the executor's ``__new__`` patch seam and unit tests); it yields a strict
    SUBSET, never a different answer.

    Paths are classified by DECLARED semantics, never guessed from the name: a
    ``Path.suffix`` heuristic misreads dotted directories and extensionless
    files. Each declared path is resolved COMPLETELY before ``.parent`` is
    taken, because taking the parent first protects the alias directory rather
    than the target (``/aliases/memory.json -> /live-data/memory.json`` would
    protect ``/aliases`` and accept ``/live-data/workspace``).
    """
    source: object = config
    if source is None:
        source = SimpleNamespace(tools=tools) if tools is not None else SimpleNamespace()

    roots = [str(_canonical(install_root))]
    declared: list[tuple[object, bool]] = [
        (_dotted(source, dotted), is_file) for dotted, is_file in _DECLARED_STATE_PATHS
    ]
    # The live memory.json is supplied by wiring rather than by config, so it
    # is passed in rather than declared above.
    declared.append((memory_path, True))
    # The ACTIVE config file is runtime state, not a Config field: Odin accepts
    # `python -m src /arbitrary/path/odin.yml`. Its directory must be protected
    # too, or a bare relative command can delete the file needed to restart —
    # reproduced with an alternate config whose parent WAS the configured
    # workspace (PR #239 round-9 review).
    declared.extend(_active_config_roots())

    for configured, is_file in declared:
        if configured is None:
            continue
        text = str(configured).strip()
        if not text:
            continue
        resolved = _canonical(text)
        root = str(resolved.parent if is_file else resolved)
        if root not in roots:
            roots.append(root)
    return roots


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

    # Protected-root overlap is checked BEFORE any mkdir. Creating the
    # directory first and rejecting afterwards would leave a new directory
    # inside the very tree this exists to protect — fail-closed must not mean
    # "reject after modifying the place we promised not to touch" (PR #239
    # round-4 review, reproduced).
    _reject_overlap(workspace, protected_roots)

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

    # Re-checked after creation/canonicalization: the pre-mkdir check used the
    # same canonical path, but re-running it keeps the guarantee local to the
    # value actually about to be used.
    _reject_overlap(workspace, protected_roots)

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


def provision_workspace(
    configured: str,
    *,
    protected_roots: Sequence[str | os.PathLike[str]] | None = None,
    allow_sudo: bool = True,
    owner_uid: int | None = None,
) -> Path:
    """THE authoritative provision-then-validate routine. Returns the workspace.

    One implementation, used by every caller — startup migration and the
    self-update preflight both go through here. A second, weaker contract
    elsewhere is worse than none: it can create a directory the runtime will
    then refuse, or provision a different directory from the one actually used
    (PR #239 round-5 review, which reproduced four such mismatches).

    Order matters. Everything that can be judged from the path alone —
    absolute, not a symlink, not overlapping a protected root — is checked
    BEFORE anything is created, so a rejected configuration never leaves a
    directory inside the tree this protects. Creation is attempted directly,
    then via ``sudo -n`` (packaged installs configure passwordless sudo for
    exactly this class of operation), and the FULL :func:`resolve_workspace`
    contract is applied afterwards.
    """
    if not configured or not str(configured).strip():
        raise WorkspaceError("tools.local_working_dir is empty")

    raw = Path(str(configured).strip()).expanduser()
    if not raw.is_absolute():
        raise WorkspaceError(f"local_working_dir must be absolute: {configured!r}")
    if raw.is_symlink():
        raise WorkspaceError(f"local_working_dir must not be a symlink: {raw}")

    target = _canonical(raw)
    _reject_overlap(target, protected_roots)

    if not target.exists():
        try:
            # parents=False deliberately: silently materialising a whole path
            # prefix is how a typo becomes a new directory tree.
            target.mkdir(mode=REQUIRED_MODE, parents=False)
            target.chmod(REQUIRED_MODE)
        except OSError:
            if allow_sudo:
                _sudo_create(target, owner_uid)

    # Full contract, including ownership, exact mode and usability. Creation
    # above is never a substitute for validation.
    return resolve_workspace(
        str(target),
        protected_roots=protected_roots,
        owner_uid=owner_uid,
        create_if_missing=False,
    )


def _sudo_create(target: Path, owner_uid: int | None) -> None:
    """Best-effort privileged creation; failures fall through to validation,
    which produces the actionable error."""
    import subprocess

    uid = os.getuid() if owner_uid is None else owner_uid
    try:
        subprocess.run(
            [
                "sudo", "-n", "install", "-d",
                f"-m{REQUIRED_MODE:o}",
                "-o", str(uid),
                "-g", str(os.getgid()),
                str(target),
            ],
            capture_output=True,
            timeout=15,
            check=False,
        )
    except Exception:
        pass


def provisioning_hint(configured: str) -> str:
    """The operator-actionable instruction, in one place."""
    return (
        f"Create it as the service account: "
        f"sudo install -d -m 0700 -o odin -g odin {configured}"
    )
