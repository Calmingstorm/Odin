"""Private, atomic publication for policy/token files and setup credentials."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

from ..odin_log import get_logger

log = get_logger("permissions.persistence")


def write_private_atomic(path: Path, content: str) -> bool:
    """Publish a complete 0600 file; return whether directory durability is proven.

    Every pre-replace failure leaves the previous file intact and raises. Once
    replace succeeds the candidate is committed: a directory-fsync failure is
    explicitly degraded, not a rejected mutation or a fictitious rollback.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    temporary: Path | None = None
    try:
        try:
            owner = path.stat()
        except FileNotFoundError:
            owner = None
        fd, name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
        temporary = Path(name)
        try:
            if owner is not None:
                current = os.fstat(fd)
                if (current.st_uid, current.st_gid) != (owner.st_uid, owner.st_gid):
                    os.fchown(fd, owner.st_uid, owner.st_gid)
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                fd = -1
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
        finally:
            if fd >= 0:
                os.close(fd)
        temporary.replace(path)
        temporary = None
        try:
            os.fsync(directory)
        except OSError:
            log.error("Private state committed but directory fsync failed; durability degraded")
            return False
        return True
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        os.close(directory)
