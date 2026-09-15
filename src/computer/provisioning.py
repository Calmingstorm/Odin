"""Private storage provisioning. No desktop discovery, activation, or authority.

Only implicit defaults may select XDG storage; callers must durably pin that
selection before publishing an enabled lifecycle. Existing paths are never moved
or repaired. Directory traversal uses no-follow descriptors, including creation.
"""

from __future__ import annotations

import errno
import os
import stat
from pathlib import Path

from ..runtime_paths import runtime_install_root
from .models import ComputerError

DEFAULT_STORAGE = Path("/var/lib/odin/computer")
_ERRORS = {
    "computer_target_incomplete": (
        "The configured computer target is incomplete.",
        "Complete the explicit display and monitors, or Wayland session bus and desktop UID, "
        "in System > Computer. Target changes require an operator-authorized Odin restart.",
    ),
    "computer_dependency_unavailable": (
        "A dependency required by the configured computer backend is unavailable.",
        "Provision the computer Python extra and the selected backend's operating-system "
        "dependencies using the operator installation guide, then retry Enable.",
    ),
    "unsafe_storage_path": (
        "Computer storage path is unsafe.",
        "Choose an absolute private directory outside the running installation, without symlinks.",
    ),
    "storage_not_private": (
        "Computer storage ownership or permissions are unsafe.",
        "Use a service-owned mode 0700 directory under trusted, non-writable ancestors.",
    ),
    "storage_unavailable": (
        "Computer storage could not be provisioned.",
        "Provide a writable private storage directory for the service account and retry.",
    ),
    "storage_schema_unsupported": (
        "Computer storage has an unsupported schema or invalid durable state.",
        "Preserve the existing store and have an operator inspect a backup; "
        "do not repair or replace the live database automatically.",
    ),
    "storage_selection_required": (
        "Computer storage requires an explicit selection.",
        "Set computer.storage_dir explicitly; existing default storage will not be migrated.",
    ),
}


class ComputerProvisioningError(ComputerError):
    """Safe public preflight failure; never includes paths or OS exception text."""

    outcome = "not_applied"

    def __init__(self, code: str):
        self.code = code if code in _ERRORS else "storage_unavailable"
        self.message, self.remedy = _ERRORS[self.code]
        ValueError.__init__(self, self.message)


def checked_path(path: str | Path) -> Path:
    p = Path(path)
    root = runtime_install_root()
    try:
        if (
            not p.is_absolute()
            or ".." in p.parts
            or p == Path("/")
            or any(part.is_symlink() for part in (p, *p.parents))
            or root in (p, *p.parents)
            or root.resolve() in (p.resolve(), *p.resolve().parents)
        ):
            raise ComputerProvisioningError("unsafe_storage_path")
    except OSError as exc:
        raise ComputerProvisioningError("storage_unavailable") from exc
    except RuntimeError as exc:
        raise ComputerProvisioningError("unsafe_storage_path") from exc
    return p


def open_private_directory(path: str | Path) -> int:
    """Create missing components with 0700, never chmod/chown existing objects.

    Root-owned sticky system ancestors (e.g. /tmp) are accepted, but their
    immediate descendant must be a private service-owned directory. Same-UID
    malicious processes and root are outside the filesystem isolation boundary.
    The returned descriptor pins the validated directory until the caller closes.
    """
    p = checked_path(path)
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    sticky_parent = False
    try:
        for index, name in enumerate(p.parts[1:]):
            final = index == len(p.parts) - 2
            try:
                os.mkdir(name, mode=0o700, dir_fd=fd)
            except FileExistsError:
                pass
            child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            try:
                info = os.fstat(child)
                named = os.stat(name, dir_fd=fd, follow_symlinks=False)
                if (info.st_dev, info.st_ino) != (named.st_dev, named.st_ino):
                    raise ComputerProvisioningError("unsafe_storage_path")
                private = final or sticky_parent
                sticky = bool(info.st_mode & stat.S_ISVTX and info.st_uid == 0)
                if private:
                    safe = info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700
                else:
                    safe = info.st_uid in {0, os.geteuid()} and (
                        not info.st_mode & 0o022 or sticky
                    )
                if not safe:
                    raise ComputerProvisioningError("storage_not_private")
                sticky_parent = sticky
            except BaseException:
                os.close(child)
                raise
            os.close(fd)
            fd = child
        result, fd = fd, -1
        return result
    except OSError as exc:
        code = (
            "unsafe_storage_path"
            if exc.errno in {errno.ELOOP, errno.ENOTDIR}
            else "storage_unavailable"
        )
        raise ComputerProvisioningError(code) from exc
    finally:
        if fd != -1:
            os.close(fd)


def provision_storage(settings) -> Path:
    """Choose only an absent implicit default; an explicit default is explicit."""
    path = Path(settings.storage_dir)
    if (
        os.geteuid() != 0
        and runtime_install_root().stat().st_uid == os.geteuid()
        and path == DEFAULT_STORAGE
        and "storage_dir" not in settings.model_fields_set
    ):
        # If the old location exists or cannot be inspected, do not hide receipts
        # by switching locations. The operator must make a deliberate selection.
        try:
            path.lstat()
        except FileNotFoundError:
            checked_path(path)
            state = os.environ.get("XDG_STATE_HOME")
            base = Path(state) if state else Path.home() / ".local" / "state"
            path = checked_path(base / "odin" / "computer")
        except OSError as exc:
            raise ComputerProvisioningError("storage_selection_required") from exc
    fd = open_private_directory(path)
    os.close(fd)
    return path
