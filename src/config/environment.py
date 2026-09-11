"""Safe narrowly-scoped edits to one declared environment file."""

from __future__ import annotations

import contextlib
import fcntl
import hashlib
import io
import os
import re
import secrets
import stat
import tempfile
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from dotenv.parser import parse_stream


class EnvironmentSourceError(RuntimeError):
    """The declared source cannot safely be edited."""


@dataclass(frozen=True)
class EnvironmentWriteResult:
    terminal_path: Path
    durable: bool


@dataclass(frozen=True)
class EnvironmentSource:
    path: Path
    owner_uid: int | None = None

    def __init__(self, path: Path | str, *, owner_uid: int | None = None) -> None:
        if owner_uid is not None and (
            isinstance(owner_uid, bool) or not isinstance(owner_uid, int)
        ):
            raise EnvironmentSourceError("environment source owner must be an integer UID")
        raw_path = os.fspath(path)
        if isinstance(raw_path, bytes):
            try:
                raw_path = raw_path.decode("utf-8", "strict")
            except UnicodeDecodeError as exc:
                raise EnvironmentSourceError("environment source path is not valid UTF-8") from exc
        if any(ord(char) < 32 or ord(char) == 127 for char in raw_path):
            raise EnvironmentSourceError("environment source path contains a control character")
        try:
            raw_path.encode("utf-8", "strict")
        except UnicodeEncodeError as exc:
            raise EnvironmentSourceError("environment source path is not valid UTF-8") from exc
        path = Path(raw_path)
        if not path.is_absolute():
            raise EnvironmentSourceError("environment source path must be absolute")
        object.__setattr__(self, "path", path)
        object.__setattr__(self, "owner_uid", os.geteuid() if owner_uid is None else owner_uid)


_KEY = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\Z")
_ASSIGNMENT_PREFIX = re.compile(r"^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*)")
_MAX_LINKS, _MAX_RETRIES, _MAX_SOURCE_BYTES = 40, 4, 1024 * 1024
_MAX_UPDATES, _MAX_VALUE_BYTES = 128, 16 * 1024


@dataclass(frozen=True)
class _Identity:
    path: Path
    dev: int
    ino: int
    mode: int
    uid: int
    gid: int
    ctime_ns: int


@dataclass(frozen=True)
class _Resolution:
    terminal: Path
    terminal_identity: _Identity | None
    links: tuple[_Identity, ...]
    parents: tuple[_Identity, ...]


def _identity(path: Path) -> _Identity:
    s = os.lstat(path)
    return _Identity(path, s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid, s.st_ctime_ns)


def _matches(s: os.stat_result, item: _Identity) -> bool:
    return (s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid) == (
        item.dev,
        item.ino,
        item.mode,
        item.uid,
        item.gid,
    )


def _same(item: _Identity) -> bool:
    try:
        return _matches(os.lstat(item.path), item)
    except OSError:
        return False


def _trusted_directory(path: Path, owner: int, *, terminal: bool = False) -> _Identity:
    try:
        link = os.lstat(path)
        s = os.stat(path)
    except OSError as exc:
        raise EnvironmentSourceError(f"environment parent is unavailable: {path}") from exc
    if stat.S_ISLNK(link.st_mode):
        raise EnvironmentSourceError(f"environment parent must not be a symlink: {path}")
    if not stat.S_ISDIR(s.st_mode):
        raise EnvironmentSourceError(f"environment parent is not a directory: {path}")
    if s.st_uid not in {owner, 0}:
        raise EnvironmentSourceError(f"environment parent has untrusted ownership: {path}")
    writable_by_others = s.st_mode & (stat.S_IWGRP | stat.S_IWOTH)
    if writable_by_others and (terminal or not s.st_mode & stat.S_ISVTX):
        raise EnvironmentSourceError(f"environment parent is writable by others: {path}")
    return _Identity(path, s.st_dev, s.st_ino, s.st_mode, s.st_uid, s.st_gid, s.st_ctime_ns)


def _resolve(source: EnvironmentSource) -> _Resolution:
    if source.owner_uid is None:
        raise EnvironmentSourceError("environment source owner is unavailable")
    current = source.path
    links: list[_Identity] = []
    parents: dict[Path, _Identity] = {}
    for _ in range(_MAX_LINKS + 1):
        parent = current.parent
        while True:
            parents.setdefault(
                parent,
                _trusted_directory(parent, source.owner_uid, terminal=parent == current.parent),
            )
            if parent == parent.parent:
                break
            parent = parent.parent
        try:
            item = _identity(current)
        except FileNotFoundError:
            return _Resolution(current, None, tuple(links), tuple(parents.values()))
        except OSError as exc:
            raise EnvironmentSourceError(f"cannot inspect environment source: {current}") from exc
        if not stat.S_ISLNK(item.mode):
            if not stat.S_ISREG(item.mode):
                raise EnvironmentSourceError("environment source terminal is not a regular file")
            if item.uid not in {source.owner_uid, 0}:
                raise EnvironmentSourceError("environment source has untrusted ownership")
            return _Resolution(current, item, tuple(links), tuple(parents.values()))
        if len(links) == _MAX_LINKS:
            raise EnvironmentSourceError("environment source symlink chain is too deep or cyclic")
        try:
            target = os.readlink(current)
        except OSError as exc:
            raise EnvironmentSourceError(f"cannot read environment symlink: {current}") from exc
        links.append(item)
        current = Path(target) if os.path.isabs(target) else current.parent / target
        current = Path(os.path.abspath(current))
    raise EnvironmentSourceError("environment source symlink loop")


def _recheck(r: _Resolution) -> None:
    if not all(_same(item) for item in (*r.links, *r.parents)):
        raise EnvironmentSourceError("environment source changed during update")
    if r.terminal_identity is None:
        if os.path.lexists(r.terminal):
            raise EnvironmentSourceError("environment source appeared during update")
    else:
        try:
            now = os.lstat(r.terminal)
        except OSError as exc:
            raise EnvironmentSourceError(
                "environment source terminal changed during update"
            ) from exc
        if (
            not _matches(now, r.terminal_identity)
            or now.st_ctime_ns != r.terminal_identity.ctime_ns
        ):
            raise EnvironmentSourceError("environment source terminal changed during update")


@contextlib.contextmanager
def _source_lock(key: str):
    d = Path(tempfile.gettempdir()) / f"odin-environment-locks-{os.geteuid()}"
    d.mkdir(mode=0o700, exist_ok=True)
    dfd = os.open(d, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        s = os.fstat(dfd)
        if s.st_uid != os.geteuid() or stat.S_IMODE(s.st_mode) != 0o700:
            raise EnvironmentSourceError("unsafe environment lock directory")
        fd = os.open(
            hashlib.sha256(os.fsencode(key)).hexdigest(),
            os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW,
            0o600,
            dir_fd=dfd,
        )
        try:
            lock_stat = os.fstat(fd)
            if (
                not stat.S_ISREG(lock_stat.st_mode)
                or lock_stat.st_uid != os.geteuid()
                or stat.S_IMODE(lock_stat.st_mode) != 0o600
            ):
                raise EnvironmentSourceError("unsafe environment lock file")
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield
        finally:
            os.close(fd)
    finally:
        os.close(dfd)


def _check_updates(updates: Mapping[str, str]) -> dict[str, str]:
    if not updates:
        raise EnvironmentSourceError("environment update is empty")
    if len(updates) > _MAX_UPDATES:
        raise EnvironmentSourceError("too many environment updates")
    result = {}
    for key, value in updates.items():
        if not isinstance(key, str) or not _KEY.fullmatch(key):
            raise EnvironmentSourceError("invalid environment variable name")
        if not isinstance(value, str):
            raise EnvironmentSourceError("environment values must be strings")
        try:
            encoded = value.encode("utf-8", "strict")
        except UnicodeEncodeError as exc:
            raise EnvironmentSourceError("environment update is not valid UTF-8") from exc
        if len(encoded) > _MAX_VALUE_BYTES:
            raise EnvironmentSourceError("environment update is too large")
        if any(ord(c) < 32 or ord(c) == 127 for c in key + value):
            raise EnvironmentSourceError("environment update contains a control character")
        result[key] = value
    return result


def _format_value(value: str) -> str:
    if value and re.fullmatch(r"[A-Za-z0-9_./:@%+=,-]+", value):
        return value
    # python-dotenv interpolates ${...} even inside single quotes. There is no
    # common literal representation with systemd EnvironmentFile for that form.
    if "${" in value:
        raise EnvironmentSourceError("value cannot roundtrip dotenv and EnvironmentFile")
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _edit(text: str, updates: Mapping[str, str]) -> str:
    output, found = [], set()
    for binding in parse_stream(io.StringIO(text)):
        original = binding.original.string
        if binding.error:
            raise EnvironmentSourceError("environment source contains an invalid dotenv binding")
        if binding.key not in updates:
            output.append(original)
            continue
        key = binding.key
        if key is None:
            output.append(original)
            continue
        found.add(key)
        ending = "\r\n" if original.endswith("\r\n") else "\n" if original.endswith("\n") else ""
        prefix = _ASSIGNMENT_PREFIX.match(original)
        if prefix is None:
            raise EnvironmentSourceError("owned dotenv binding has unsupported formatting")
        output.append(f"{prefix.group(1)}{_format_value(updates[key])}{ending}")
    if output and not output[-1].endswith(("\n", "\r")):
        output.append("\n")
    newline = "\r\n" if "\r\n" in text and "\n" not in text.replace("\r\n", "") else "\n"
    output.extend(
        f"{key}={_format_value(value)}{newline}"
        for key, value in updates.items()
        if key not in found
    )
    return "".join(output)


def _open_parent(r: _Resolution) -> tuple[int, _Identity]:
    expected = next((x for x in r.parents if x.path == r.terminal.parent), None)
    if expected is None:
        raise EnvironmentSourceError("environment parent was not resolved")
    try:
        fd = os.open(r.terminal.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    except OSError as exc:
        raise EnvironmentSourceError("cannot open environment parent") from exc
    if not _matches(os.fstat(fd), expected):
        os.close(fd)
        raise EnvironmentSourceError("environment parent changed during update")
    return fd, expected


def _read_terminal(r: _Resolution, parent_fd: int) -> str:
    if r.terminal_identity is None:
        return ""
    try:
        fd = os.open(r.terminal.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
        with os.fdopen(fd, "r", encoding="utf-8", newline="") as stream:
            s = os.fstat(stream.fileno())
            if not stat.S_ISREG(s.st_mode) or not _matches(s, r.terminal_identity):
                raise EnvironmentSourceError("environment source terminal changed during update")
            old = stream.read(_MAX_SOURCE_BYTES + 1)
    except UnicodeDecodeError as exc:
        raise EnvironmentSourceError("environment source is not valid UTF-8") from exc
    except OSError as exc:
        raise EnvironmentSourceError("cannot read environment source") from exc
    if len(old.encode("utf-8")) > _MAX_SOURCE_BYTES:
        raise EnvironmentSourceError("environment source is too large")
    return old


def edit_environment(
    source: EnvironmentSource, updates: Mapping[str, str]
) -> EnvironmentWriteResult:
    updates = _check_updates(updates)
    for _ in range(_MAX_RETRIES):
        initial = _resolve(source)
        with _source_lock(str(initial.terminal)):
            r = _resolve(source)
            if r.terminal != initial.terminal:
                continue
            parent_fd, parent_identity = _open_parent(r)
            temporary, committed = None, False
            try:
                new = _edit(_read_terminal(r, parent_fd), updates)
                _recheck(r)
                for _ in range(16):
                    candidate = f".{r.terminal.name}.{secrets.token_hex(16)}.tmp"
                    try:
                        fd = os.open(
                            candidate,
                            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                            0o600,
                            dir_fd=parent_fd,
                        )
                        temporary = candidate
                        break
                    except FileExistsError:
                        pass
                else:
                    raise EnvironmentSourceError("could not allocate environment temporary file")
                try:
                    if r.terminal_identity is not None:
                        os.fchown(fd, r.terminal_identity.uid, r.terminal_identity.gid)
                    # fchown may clear set mode bits. Set this explicitly instead
                    # of relying on the caller's umask or the O_CREAT mode.
                    os.fchmod(fd, 0o600)
                    with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
                        fd = -1
                        stream.write(new)
                        stream.flush()
                        os.fsync(stream.fileno())
                finally:
                    if fd >= 0:
                        os.close(fd)
                _recheck(r)
                if not _matches(os.fstat(parent_fd), parent_identity):
                    raise EnvironmentSourceError("environment parent changed during update")
                os.replace(temporary, r.terminal.name, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
                temporary, committed = None, True
                try:
                    os.fsync(parent_fd)
                except OSError:
                    return EnvironmentWriteResult(r.terminal, False)
                return EnvironmentWriteResult(r.terminal, True)
            except EnvironmentSourceError:
                raise
            except OSError as exc:
                raise EnvironmentSourceError(
                    f"environment publication failed {'after' if committed else 'before'} commit"
                ) from exc
            finally:
                if temporary is not None:
                    with contextlib.suppress(OSError):
                        os.unlink(temporary, dir_fd=parent_fd)
                os.close(parent_fd)
    raise EnvironmentSourceError("environment source changed while acquiring its lock")
