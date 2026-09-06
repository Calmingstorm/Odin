"""Race-resistant bounded readback from the private exports directory only."""

from __future__ import annotations

import os
import stat

from .profile import MAX_EXPORT_BYTES, basename


def read_export(name: str, *, directory_fd: int) -> bytes:
    basename(name)
    fd = os.open(
        name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC, dir_fd=directory_fd
    )
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
            raise ValueError("export must be a single-link regular file")
        if not 0 < before.st_size <= MAX_EXPORT_BYTES:
            raise ValueError("export exceeds permitted size")
        chunks = []
        remaining = before.st_size
        while remaining:
            data = os.read(fd, min(65536, remaining))
            if not data:
                raise ValueError("export changed while reading")
            chunks.append(data)
            remaining -= len(data)
        after = os.fstat(fd)
        named = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        def signature(value):
            return (
                value.st_dev, value.st_ino, value.st_size,
                value.st_mtime_ns, value.st_ctime_ns, value.st_nlink,
            )
        if signature(before) != signature(after) or signature(after) != signature(named):
            raise ValueError("export changed while reading")
        return b"".join(chunks)
    finally:
        os.close(fd)
