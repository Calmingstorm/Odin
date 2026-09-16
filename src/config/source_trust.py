"""Administrator-delegated group-write trust for source installations.

Group membership (including the service's primary group) is not proof that no
other account can write a directory. Only an explicit root-controlled policy
can delegate that authority. The state directory itself remains private.
"""
from __future__ import annotations

import errno
import json
import os
import stat
from pathlib import Path

_POLICY_PATH = Path("/etc/odin/source-trust.json")
_MAX_POLICY_BYTES = 16384


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate policy key")
        result[key] = value
    return result


def _read_policy() -> object:
    """No-follow root-owned, non-group/world-writable policy and ancestors."""
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in _POLICY_PATH.parts[1:-1]:
            info = os.fstat(fd)
            if info.st_uid != 0 or info.st_mode & 0o022:
                raise ValueError("unsafe policy ancestor")
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        info = os.fstat(fd)
        if info.st_uid != 0 or info.st_mode & 0o022:
            raise ValueError("unsafe policy parent")
        policy_fd = os.open(
            _POLICY_PATH.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd
        )
        try:
            info = os.fstat(policy_fd)
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0
                    or info.st_mode & 0o022 or info.st_size > _MAX_POLICY_BYTES):
                raise ValueError("unsafe policy file")
            with os.fdopen(policy_fd, "rb") as handle:
                policy_fd = -1
                data = handle.read(_MAX_POLICY_BYTES + 1)
            if len(data) > _MAX_POLICY_BYTES:
                raise ValueError("oversized policy")
            return json.loads(data, object_pairs_hook=_unique_object)
        finally:
            if policy_fd >= 0:
                os.close(policy_fd)
    finally:
        os.close(fd)


def trusted_group_write(
    info: os.stat_result, *, owner_uid: int, directory: int | Path | None = None
) -> bool:
    """Delegate only this exact service-owner/group pair, never world-write."""
    if info.st_uid != owner_uid or info.st_mode & stat.S_IWOTH:
        return False
    if directory is None:
        return False
    try:
        os.getxattr(directory, "system.posix_acl_access")
    except OSError as exc:
        if exc.errno not in {errno.ENODATA, errno.ENOTSUP}:
            return False
    else:
        # Group permission bits are the ACL mask when named entries exist.
        # Delegating the owning group must not delegate an unrelated ACL user.
        return False
    try:
        policy = _read_policy()
        if (not isinstance(policy, dict)
                or set(policy) != {"version", "trusted_owner_groups"}
                or type(policy["version"]) is not int or policy["version"] != 1):
            return False
        pairs = policy["trusted_owner_groups"]
        if not isinstance(pairs, list):
            return False
        for pair in pairs:
            if (not isinstance(pair, dict) or set(pair) != {"uid", "gid"}
                    or any(type(pair[k]) is not int or pair[k] < 0 for k in ("uid", "gid"))):
                return False
        return {"uid": owner_uid, "gid": info.st_gid} in pairs
    except (OSError, ValueError, UnicodeError):
        # Missing, unreadable and malformed delegation all mean no delegation.
        return False
