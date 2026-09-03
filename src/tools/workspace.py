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
from collections.abc import Callable, Sequence
from pathlib import Path
from types import SimpleNamespace

from ..config.workspace_paths import WORKSPACE_PROTECTED_CONFIG_PATHS

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

# Set once at startup when the legacy-config fallback engages. Process-wide
# startup state, like the active config path — read by the startup diagnostic
# so a fallback is VISIBLE rather than indistinguishable from normal operation.
# Keep the failed configured path as well as the active fallback: startup
# mutates ToolsConfig to the fallback so every runtime consumer agrees, and
# without this copy later remediation would point at the already-working path.
_STARTUP_FALLBACK: tuple[str, str, str] | None = None


def startup_fallback() -> tuple[str, str, str] | None:
    """``(active_workspace, configured_workspace, reason)`` after fallback."""
    return _STARTUP_FALLBACK


class WorkspaceError(RuntimeError):
    """The configured local workspace is unusable. Never fall back to cwd."""


def _canonical(path: str | os.PathLike[str]) -> Path:
    """Fully resolved path, symlinks included — aliases must not smuggle a
    protected root past the overlap check."""
    return Path(path).expanduser().resolve(strict=False)


def _lexical_absolute(path: str | os.PathLike[str]) -> Path:
    """Absolute spelling with ``..`` removed but symlink components intact.

    Canonical paths protect the object reached through an alias. Lexical paths
    protect the alias components a running process will traverse again. Both
    matter: deleting an alias can strand sessions, credentials, or the checkout
    used for an in-place restart even when the canonical target survives.
    """
    return Path(os.path.abspath(Path(path).expanduser()))


def _path_spellings(path: str | os.PathLike[str]) -> tuple[Path, ...]:
    """Unique lexical and canonical spellings, in stable order."""
    lexical = _lexical_absolute(path)
    canonical = _canonical(path)
    return (lexical,) if lexical == canonical else (lexical, canonical)


def _overlaps(workspace: Path, root: Path) -> bool:
    """True when the two paths are the same or either contains the other."""
    return workspace == root or root in workspace.parents or workspace in root.parents


def _reject_overlap(
    workspace: Path, protected_roots: Sequence[str | os.PathLike[str]] | None
) -> None:
    """Raise if ``workspace`` overlaps any protected root, in either direction."""
    for root in protected_roots or []:
        # BOTH spellings: lexical-absolute (as given) and canonical (symlinks
        # resolved). For ordinary roots they coincide; for the deliberately-
        # lexical launch-path root they do not, and resolving it here would
        # collapse the alias back onto its target and un-protect the component
        # the restart traverses (PR #239 round-11 review).
        for candidate in _path_spellings(root):
            if _overlaps(workspace, candidate):
                raise WorkspaceError(
                    f"local_working_dir must not overlap {candidate}: {workspace}"
                )


# Live-state paths declared by the FULL configuration, with their DECLARED
# file/directory semantics. Any of these can be relocated independently of the
# data directory, and a workspace overlapping one is as dangerous as a
# workspace inside ./data — round 8 reproduced a valid Config whose
# sessions.persist_directory WAS the workspace, accepted by every caller
# because only audit/trajectory/memory were protected.
#
# Deliberately excluded: email.allowed_attachment_dirs contains user-nominated
# source directories, not Odin state; protecting it would reject legitimate configurations.
# Paths wiring hardcodes (channel_config.json, channel_logs) sit beside
# memory.json and are covered by its parent.
_DECLARED_STATE_PATHS = WORKSPACE_PROTECTED_CONFIG_PATHS


def _active_config_roots() -> list[str]:
    """Directory roots the live config depends on, as FINAL root strings.

    Two spellings, deliberately different in kind:

    - the CANONICAL target's directory (symlinks fully resolved), so the real
      file is protected wherever any alias points;
    - the LAUNCH path's parent kept LEXICAL — absolutized but with symlinks
      NOT resolved — because ``restart.reexec()`` replays ``sys.argv``. With a
      symlinked ancestor component (``workspace/cfg -> real/``, launched as
      ``workspace/cfg/odin.yml``), canonicalizing the parent collapses it onto
      ``real`` and leaves the component the restart actually traverses
      unprotected: a workspace-relative ``rm -rf cfg`` breaks the next re-exec
      while the canonical target survives (PR #239 round-11 review,
      reproduced; round 10 had only handled a symlinked leaf FILE).

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
    roots: list[str] = []
    if canonical:
        roots.append(str(_canonical(canonical).parent))
    if launch:
        # os.path.abspath normalizes WITHOUT resolving symlinks — that is the
        # point. (active_config_launch_path already stores an abspath; applied
        # again here defensively, it is idempotent.)
        roots.append(str(Path(os.path.abspath(launch)).parent))
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
    files. Each declared path is kept under both its lexical and canonical
    spelling before file parents are taken: the lexical spelling protects the
    alias a running subsystem traverses, while the canonical spelling protects
    its target (``/aliases/memory.json -> /live-data/memory.json`` needs both).
    """
    source: object = config
    if source is None:
        source = SimpleNamespace(tools=tools) if tools is not None else SimpleNamespace()

    roots: list[str] = []

    def _append_path(path: object, *, is_file: bool) -> None:
        """Protect both how a path is named and what that name reaches."""
        if path is None:
            return
        text = str(path).strip()
        if not text:
            return
        for spelling in _path_spellings(text):
            root = str(spelling.parent if is_file else spelling)
            if root not in roots:
                roots.append(root)

    _append_path(install_root, is_file=False)
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
    for config_root in _active_config_roots():
        _append_path(config_root, is_file=False)

    for configured, is_file in declared:
        _append_path(configured, is_file=is_file)
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


def provision_startup_workspace(
    tools_config: object,
    *,
    protected_roots: Sequence[str | os.PathLike[str]] | None = None,
    owner_uid: int | None = None,
    on_fallback: Callable[[Path, str, WorkspaceError], None] | None = None,
) -> Path:
    """Provision the workspace used by the incoming process at startup.

    Existing source/git installs have config files from before
    ``local_working_dir`` existed. On their first in-place update the old
    updater cannot run the new preflight, and an unprivileged developer account
    commonly cannot create the schema default under ``/var/lib`` or use
    ``sudo -n``. Failing closed there would preserve safety by silently losing
    all local-command capability.

    Explicit configuration is authoritative and never substituted. Only a
    genuinely absent legacy field may fall back, after the normal default
    cannot be provisioned, to a stable private directory in the service user's
    home. The selected value is written into the live ``ToolsConfig`` object so
    startup, the executor, diagnostics, and the next self-update all use the
    identical path for this process. A later PUT /api/config persists it through
    the normal validated config path; otherwise the deterministic migration is
    repeated on future starts.
    """
    configured = str(getattr(tools_config, "local_working_dir", "") or "")
    try:
        return provision_workspace(
            configured,
            protected_roots=protected_roots,
            owner_uid=owner_uid,
        )
    except WorkspaceError as default_error:
        fields_set: set[str] = set(getattr(tools_config, "model_fields_set", set()))
        if "local_working_dir" in fields_set:
            raise

        # A direct child of HOME needs no recursive parent creation, remains
        # stable across commands/restarts, and is outside a normal source
        # checkout.
        #
        # It is NOT a safety boundary for packaged installs. The packaged unit
        # sets User= but no Environment=HOME, so HOME comes from the account
        # record and is typically OUTSIDE the install (verified: /home/odin on
        # a real deployment) — a broken packaged default therefore falls back
        # here instead of rejecting. That is deliberate, because losing every
        # local command is worse; it is made VISIBLE instead, via the warning
        # below and the startup diagnostic, so a packaging failure is reported
        # rather than hidden (cross-review of PR #239 round 13).
        fallback = Path.home() / ".odin-workspace"
        try:
            workspace = provision_workspace(
                str(fallback),
                protected_roots=protected_roots,
                owner_uid=owner_uid,
                allow_sudo=False,
            )
        except WorkspaceError:
            raise default_error
        setattr(tools_config, "local_working_dir", str(workspace))
        global _STARTUP_FALLBACK
        _STARTUP_FALLBACK = (str(workspace), configured, str(default_error))
        if on_fallback is not None:
            on_fallback(workspace, configured, default_error)
        return workspace


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
