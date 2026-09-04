"""Strict, transactional implementation for the ``apply_patch`` tool.

The model-facing handler validates the patch envelope locally, serializes the
validated plan as JSON, and transports that plan plus this self-contained
module to the selected host using base64.  The host performs a second structural
validation, resolves every relative path beneath the explicit root, computes
all resulting file contents before touching a target, stages private temporary
files, then commits or rolls every changed path back.
"""

from __future__ import annotations

import os
import secrets
import stat
from collections.abc import Callable
from pathlib import PurePosixPath
from typing import Any

BEGIN_PATCH = "*** Begin Patch"
END_PATCH = "*** End Patch"
ADD_FILE = "*** Add File: "
UPDATE_FILE = "*** Update File: "
DELETE_FILE = "*** Delete File: "
MOVE_TO = "*** Move to: "
MAX_PATCH_BYTES = 48 * 1024
MAX_HUNK_ANCHORS = 8
PLAN_VERSION = 3


class PatchError(ValueError):
    """The patch is malformed, stale, unsafe, or could not be committed."""


class PatchRollbackError(PatchError):
    """A commit failed and one or more rollback operations also failed."""

    def __init__(
        self,
        original: BaseException,
        failures: list[str],
        recovery_artifacts: list[str] | None = None,
    ) -> None:
        artifacts = recovery_artifacts or []
        suffix = f"; recovery artifacts retained: {', '.join(artifacts)}" if artifacts else ""
        super().__init__(
            f"commit failed ({original}); rollback or cleanup also failed: "
            f"{'; '.join(failures)}{suffix}"
        )
        self.original = original
        self.failures = failures
        self.recovery_artifacts = artifacts


def _relative_path(raw: object) -> str:
    if not isinstance(raw, str) or not raw:
        raise PatchError("file paths must be non-empty strings")
    if raw != raw.strip() or any(ord(ch) < 32 for ch in raw):
        raise PatchError(f"invalid file path: {raw!r}")
    if "\\" in raw or raw.startswith("/") or raw.endswith("/") or "//" in raw:
        raise PatchError(f"file path must be a normalized relative POSIX path: {raw!r}")
    path = PurePosixPath(raw)
    if (
        not path.parts
        or raw == "."
        or any(part in ("", ".", "..") for part in path.parts)
        or str(path) != raw
    ):
        raise PatchError(f"file path must stay beneath root: {raw!r}")
    return raw


def _operation_header(line: str) -> bool:
    return line.startswith((ADD_FILE, UPDATE_FILE, DELETE_FILE))


def parse_patch(patch_text: object) -> dict[str, Any]:
    """Parse one exact apply-patch envelope into a JSON-safe operation plan."""
    if not isinstance(patch_text, str):
        raise PatchError("patch_text must be a string")
    try:
        size = len(patch_text.encode("utf-8", errors="strict"))
    except UnicodeEncodeError as exc:
        raise PatchError("patch_text must be valid UTF-8 text") from exc
    if size > MAX_PATCH_BYTES:
        raise PatchError(f"patch_text exceeds the {MAX_PATCH_BYTES}-byte limit")
    if "\x00" in patch_text or "\r" in patch_text:
        raise PatchError("patch_text must use NUL-free LF text")

    lines = patch_text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    if len(lines) < 3 or lines[0] != BEGIN_PATCH or lines[-1] != END_PATCH:
        raise PatchError("patch must be exactly framed by *** Begin Patch and *** End Patch")

    operations: list[dict[str, Any]] = []
    claimed: set[str] = set()
    index = 1
    end = len(lines) - 1

    def claim(path: str) -> None:
        if path in claimed:
            raise PatchError(f"path appears more than once in patch: {path}")
        claimed.add(path)

    while index < end:
        header = lines[index]
        if header.startswith(ADD_FILE):
            path = _relative_path(header[len(ADD_FILE) :])
            claim(path)
            index += 1
            added: list[str] = []
            while index < end and not _operation_header(lines[index]):
                line = lines[index]
                if not line.startswith("+"):
                    raise PatchError(f"Add File {path}: every content line must start with '+'")
                added.append(line[1:])
                index += 1
            if not added:
                raise PatchError(f"Add File {path}: at least one '+' line is required")
            operations.append({"action": "add", "path": path, "content": "\n".join(added) + "\n"})
            continue

        if header.startswith(DELETE_FILE):
            path = _relative_path(header[len(DELETE_FILE) :])
            claim(path)
            operations.append({"action": "delete", "path": path})
            index += 1
            if index < end and not _operation_header(lines[index]):
                raise PatchError(f"Delete File {path}: no body is allowed")
            continue

        if header.startswith(UPDATE_FILE):
            path = _relative_path(header[len(UPDATE_FILE) :])
            claim(path)
            index += 1
            move_to: str | None = None
            if index < end and lines[index].startswith(MOVE_TO):
                move_to = _relative_path(lines[index][len(MOVE_TO) :])
                claim(move_to)
                index += 1

            hunks: list[dict[str, Any]] = []
            while index < end and not _operation_header(lines[index]):
                marker = lines[index]
                hunk_line = index + 1
                if marker != "@@" and not marker.startswith("@@ "):
                    raise PatchError(
                        f"Update File {path}: expected an @@ hunk at patch line {hunk_line}, "
                        f"got {marker!r}"
                    )
                # Consecutive NAMED @@ lines before the first body line form one
                # ordered anchor chain — the dialect's "@@ class X / @@ def y()"
                # jump to the right context.  A bare @@ always opens its own
                # unanchored hunk.
                anchors: list[str] = []
                while marker.startswith("@@ "):
                    anchor = marker[3:]
                    if not anchor.strip():
                        raise PatchError(
                            f"Update File {path}: empty @@ anchor at patch line {index + 1}"
                        )
                    if any(ord(ch) < 32 for ch in anchor):
                        raise PatchError(
                            f"Update File {path}: control character in @@ anchor at patch line "
                            f"{index + 1}"
                        )
                    if len(anchors) >= MAX_HUNK_ANCHORS:
                        raise PatchError(
                            f"Update File {path}: more than {MAX_HUNK_ANCHORS} @@ anchors "
                            f"chained at patch line {index + 1}"
                        )
                    anchors.append(anchor)
                    index += 1
                    if index < end and lines[index].startswith("@@ "):
                        marker = lines[index]
                        continue
                    break
                else:
                    index += 1  # the bare @@ marker
                hunk_lines: list[str] = []
                changed = False
                while (
                    index < end
                    and not _operation_header(lines[index])
                    and not lines[index].startswith("@@")
                ):
                    line = lines[index]
                    if not line or line[0] not in " +-":
                        raise PatchError(
                            f"Update File {path}: patch line {index + 1} must start with "
                            "space, '+', or '-'"
                        )
                    changed = changed or line[0] in "+-"
                    hunk_lines.append(line)
                    index += 1
                if not hunk_lines or not changed:
                    raise PatchError(
                        f"Update File {path}: the hunk introduced at patch line {hunk_line} "
                        "contains no '+' or '-' line"
                    )
                hunks.append(
                    {"anchors": anchors, "lines": hunk_lines, "patch_line": hunk_line}
                )
            if not hunks:
                raise PatchError(f"Update File {path}: at least one @@ hunk is required")
            operations.append(
                {"action": "update", "path": path, "move_to": move_to, "hunks": hunks}
            )
            continue

        raise PatchError(f"unexpected patch line: {header!r}")

    if not operations:
        raise PatchError("patch must contain at least one file operation")
    return {"version": PLAN_VERSION, "operations": operations}


def _validated_plan(plan: object) -> list[dict[str, Any]]:
    """Validate the transported plan independently of the model-side parser."""
    if (
        not isinstance(plan, dict)
        or set(plan) != {"version", "operations"}
        or plan["version"] != PLAN_VERSION
    ):
        raise PatchError("invalid transported patch plan")
    operations = plan["operations"]
    if not isinstance(operations, list) or not operations:
        raise PatchError("invalid transported patch operations")
    claimed: set[str] = set()
    normalized: list[dict[str, Any]] = []
    for op in operations:
        if not isinstance(op, dict) or op.get("action") not in {"add", "update", "delete"}:
            raise PatchError("invalid transported patch operation")
        action = op["action"]
        path = _relative_path(op.get("path"))
        if path in claimed:
            raise PatchError(f"path appears more than once in patch: {path}")
        claimed.add(path)
        if action == "add":
            if set(op) != {"action", "path", "content"} or not isinstance(op["content"], str):
                raise PatchError("invalid transported Add File operation")
            normalized.append({"action": action, "path": path, "content": op["content"]})
        elif action == "delete":
            if set(op) != {"action", "path"}:
                raise PatchError("invalid transported Delete File operation")
            normalized.append({"action": action, "path": path})
        else:
            if set(op) != {"action", "path", "move_to", "hunks"}:
                raise PatchError("invalid transported Update File operation")
            move_to = op["move_to"]
            if move_to is not None:
                move_to = _relative_path(move_to)
                if move_to in claimed:
                    raise PatchError(f"path appears more than once in patch: {move_to}")
                claimed.add(move_to)
            hunks = op["hunks"]
            if not isinstance(hunks, list) or not hunks:
                raise PatchError("invalid transported update hunks")
            clean_hunks: list[dict[str, Any]] = []
            for hunk in hunks:
                if not isinstance(hunk, dict) or set(hunk) != {
                    "anchors",
                    "lines",
                    "patch_line",
                }:
                    raise PatchError("invalid transported update hunk")
                anchors = hunk["anchors"]
                hunk_lines = hunk["lines"]
                patch_line = hunk["patch_line"]
                if (
                    not isinstance(anchors, list)
                    or len(anchors) > MAX_HUNK_ANCHORS
                    or not all(
                        isinstance(anchor, str)
                        and anchor.strip()
                        and not any(ord(ch) < 32 for ch in anchor)
                        for anchor in anchors
                    )
                ):
                    raise PatchError("invalid transported hunk anchors")
                if (
                    not isinstance(hunk_lines, list)
                    or not hunk_lines
                    or not all(
                        isinstance(line, str) and line and line[0] in " +-" for line in hunk_lines
                    )
                    or not any(line[0] in "+-" for line in hunk_lines)
                ):
                    raise PatchError("invalid transported hunk lines")
                if (
                    isinstance(patch_line, bool)
                    or not isinstance(patch_line, int)
                    or patch_line < 1
                ):
                    raise PatchError("invalid transported hunk patch line")
                clean_hunks.append(
                    {
                        "anchors": list(anchors),
                        "lines": hunk_lines,
                        "patch_line": patch_line,
                    }
                )
            normalized.append(
                {"action": action, "path": path, "move_to": move_to, "hunks": clean_hunks}
            )
    return normalized


def _find_unique(sequence: list[str], pattern: list[str], start: int, label: str) -> int:
    if not pattern:
        return start
    matches = [
        idx
        for idx in range(start, len(sequence) - len(pattern) + 1)
        if sequence[idx : idx + len(pattern)] == pattern
    ]
    if not matches:
        raise PatchError(f"context mismatch in {label}")
    if len(matches) != 1:
        raise PatchError(
            f"context is ambiguous in {label}; add more unchanged lines or an @@ anchor"
        )
    return matches[0]


def _matching_positions(sequence: list[str], pattern: list[str], start: int) -> list[int]:
    """Return every exact occurrence of *pattern* at or after *start*."""
    return [
        idx
        for idx in range(start, len(sequence) - len(pattern) + 1)
        if sequence[idx : idx + len(pattern)] == pattern
    ]


def _find_unique_chain_body(
    sequence: list[str],
    anchors: list[str],
    body: list[str],
    start: int,
    label: str,
) -> int:
    """Resolve exactly one complete monotonic anchor-chain + old-body match.

    Counting complete tuples, rather than choosing the first later anchor or
    body, prevents a plausible prefix from redirecting an edit into a later
    nested or repeated target. Search stops after the second match because only
    the zero/one/many distinction matters.
    """
    positions = [_matching_positions(sequence, [anchor], start) for anchor in anchors]
    if any(not found for found in positions):
        raise PatchError(f"context mismatch in {label}")

    # Count monotonic prefixes ending at every anchor occurrence, saturated at
    # two. This enumerates the complete chains without exponential recursion
    # on a file full of repeated lines.
    counts = [1] * len(positions[0])
    for layer_index in range(1, len(positions)):
        previous_positions = positions[layer_index - 1]
        current_positions = positions[layer_index]
        next_counts: list[int] = []
        previous_index = 0
        prefix_count = 0
        for current in current_positions:
            while (
                previous_index < len(previous_positions)
                and previous_positions[previous_index] < current
            ):
                prefix_count = min(2, prefix_count + counts[previous_index])
                previous_index += 1
            next_counts.append(prefix_count)
        counts = next_counts

    final_positions = positions[-1]
    complete_count = 0
    unique_at: int | None = None
    if body:
        final_index = 0
        prefix_count = 0
        for body_at in _matching_positions(sequence, body, start):
            while final_index < len(final_positions) and final_positions[final_index] <= body_at:
                prefix_count = min(2, prefix_count + counts[final_index])
                final_index += 1
            if prefix_count:
                complete_count = min(2, complete_count + prefix_count)
                unique_at = body_at
            if complete_count > 1:
                break
    else:
        for anchor_at, count in zip(final_positions, counts, strict=True):
            if count:
                complete_count = min(2, complete_count + count)
                unique_at = anchor_at
            if complete_count > 1:
                break

    if complete_count == 0:
        raise PatchError(f"context mismatch in {label}")
    if complete_count != 1:
        raise PatchError(
            f"context is ambiguous in {label}; the anchor chain and hunk body "
            "have multiple complete matches"
        )
    assert unique_at is not None
    return unique_at


def _hunk_label(path: str, hunk: dict[str, Any]) -> str:
    anchors = hunk["anchors"]
    rendered = ", ".join(f"@@ {anchor}" for anchor in anchors) if anchors else "<none>"
    return f"{path}, hunk at patch line {hunk['patch_line']}, anchors [{rendered}]"


def _apply_hunks(path: str, source: str, hunks: list[dict[str, Any]]) -> str:
    had_final_newline = source.endswith(("\n", "\r"))
    newline = "\r\n" if "\n" in source and source.count("\r\n") == source.count("\n") else "\n"
    lines = source.splitlines()
    cursor = 0
    for hunk in hunks:
        anchors = hunk["anchors"]
        label = _hunk_label(path, hunk)
        old_lines = [line[1:] for line in hunk["lines"] if line[0] in " -"]
        new_lines = [line[1:] for line in hunk["lines"] if line[0] in " +"]
        if len(anchors) > 1:
            at = _find_unique_chain_body(lines, anchors, old_lines, cursor, label)
        elif anchors:
            anchor_at = _find_unique(lines, [anchors[0]], cursor, label)
            at = _find_unique(lines, old_lines, anchor_at, label) if old_lines else anchor_at
        elif old_lines:
            at = _find_unique(lines, old_lines, cursor, label)
        else:
            at = len(lines)
        lines[at : at + len(old_lines)] = new_lines
        cursor = at + len(new_lines)
    result = newline.join(lines)
    if had_final_newline:
        result += newline
    return result


class _DirectoryRegistry:
    """Open and retain root-relative directories without following symlinks."""

    def __init__(
        self,
        root_value: object,
        *,
        rename_noreplace: Callable[..., None],
    ) -> None:
        if (
            not isinstance(root_value, str)
            or not root_value.startswith("/")
            or "\x00" in root_value
        ):
            raise PatchError("root must be an absolute path")
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW
        try:
            root_fd = os.open(root_value, flags)
        except OSError as exc:
            raise PatchError(
                f"root must be an existing non-symlink directory: {type(exc).__name__}: {exc}"
            ) from exc
        self.root_value = root_value.rstrip("/") or "/"
        self._fds: dict[tuple[str, ...], int] = {(): root_fd}
        self._flags = flags
        self._rename_noreplace = rename_noreplace
        self._created: list[dict[str, Any]] = []

    def parent(self, relative: str, *, create_missing: bool = False) -> tuple[int, str, str]:
        parts = PurePosixPath(relative).parts
        prefix: tuple[str, ...] = ()
        for part in parts[:-1]:
            child_prefix = (*prefix, part)
            if child_prefix not in self._fds:
                try:
                    fd = os.open(part, self._flags, dir_fd=self._fds[prefix])
                except FileNotFoundError as exc:
                    if not create_missing:
                        raise PatchError(
                            "parent directory is missing, not a directory, or a symlink: "
                            f"{relative}"
                        ) from exc
                    fd = self._create_directory(prefix, child_prefix, part)
                except OSError as exc:
                    raise PatchError(
                        f"parent directory is missing, not a directory, or a symlink: {relative}"
                    ) from exc
                self._fds[child_prefix] = fd
            prefix = child_prefix
        return self._fds[prefix], parts[-1], "/".join(parts[:-1])

    def existing_parent(self, relative: str) -> tuple[int, str, str] | None:
        """Return an existing no-follow parent, or None after the first absent component."""
        parts = PurePosixPath(relative).parts
        prefix: tuple[str, ...] = ()
        for part in parts[:-1]:
            child_prefix = (*prefix, part)
            if child_prefix not in self._fds:
                try:
                    fd = os.open(part, self._flags, dir_fd=self._fds[prefix])
                except FileNotFoundError:
                    return None
                except OSError as exc:
                    raise PatchError(
                        f"parent directory is missing, not a directory, or a symlink: {relative}"
                    ) from exc
                self._fds[child_prefix] = fd
            prefix = child_prefix
        return self._fds[prefix], parts[-1], "/".join(parts[:-1])

    def _create_directory(
        self,
        parent_prefix: tuple[str, ...],
        child_prefix: tuple[str, ...],
        name: str,
    ) -> int:
        parent_fd = self._fds[parent_prefix]
        label = "/".join(child_prefix)
        stage_name = ""
        for _ in range(128):
            stage_name = f".odin-patch-dir-{secrets.token_hex(16)}"
            try:
                os.mkdir(stage_name, 0o700, dir_fd=parent_fd)
                break
            except FileExistsError:
                continue
        else:
            raise PatchError("could not allocate an unpredictable private staging directory")

        stage_label = self.display("/".join(parent_prefix), stage_name)
        stage_fd = -1
        published = False
        record: dict[str, Any] | None = None
        try:
            stage_fd = os.open(stage_name, self._flags, dir_fd=parent_fd)
            staged = os.fstat(stage_fd)
            if not stat.S_ISDIR(staged.st_mode):
                raise PatchError(f"private parent stage is not a directory: {stage_label}")
            expected = (staged.st_dev, staged.st_ino)
            os.fchmod(stage_fd, 0o755)
            os.fsync(stage_fd)
            try:
                _durable_rename_noreplace(
                    stage_name,
                    name,
                    src_dir_fd=parent_fd,
                    dst_dir_fd=parent_fd,
                    rename_noreplace=self._rename_noreplace,
                )
            except BaseException as original:
                target = _entry_info(parent_fd, name)
                if target is not None and (target.st_dev, target.st_ino) == expected:
                    published = True
                    record = {
                        "parent_fd": parent_fd,
                        "name": name,
                        "label": label,
                        "expected": expected,
                    }
                    self._created.append(record)
                    # A failure-injection wrapper may raise after renameat2.
                    # Persist the observed dirent before rollback removes it.
                    os.fsync(parent_fd)
                    raise

                cleanup_failures: list[str] = []
                try:
                    os.rmdir(stage_name, dir_fd=parent_fd)
                    os.fsync(parent_fd)
                except OSError as cleanup_exc:
                    cleanup_failures.append(
                        f"private staging directory {stage_label}: "
                        f"{type(cleanup_exc).__name__}: {cleanup_exc}"
                    )
                if cleanup_failures:
                    raise PatchRollbackError(
                        original,
                        cleanup_failures,
                        [stage_label],
                    ) from original
                if isinstance(original, FileExistsError):
                    try:
                        return os.open(name, self._flags, dir_fd=parent_fd)
                    except OSError as exc:
                        raise PatchError(
                            "parent directory is missing, not a directory, or a symlink: "
                            f"{label}"
                        ) from exc
                raise

            published = True
            record = {
                "parent_fd": parent_fd,
                "name": name,
                "label": label,
                "expected": expected,
            }
            self._created.append(record)
            target = _entry_info(parent_fd, name)
            if target is None or (target.st_dev, target.st_ino) != expected:
                raise PatchError(f"created parent directory changed during publish: {label}")
            return stage_fd
        except BaseException:
            if stage_fd >= 0:
                os.close(stage_fd)
            if not published:
                # The normal cleanup path above already removed the stage. If
                # failure happened before publish was attempted, remove it here.
                try:
                    if not _entry_missing(parent_fd, stage_name):
                        os.rmdir(stage_name, dir_fd=parent_fd)
                        os.fsync(parent_fd)
                except OSError as cleanup_exc:
                    raise PatchRollbackError(
                        PatchError(f"could not create parent directory: {label}"),
                        [
                            f"private staging directory {stage_label}: "
                            f"{type(cleanup_exc).__name__}: {cleanup_exc}"
                        ],
                        [stage_label],
                    ) from cleanup_exc
            raise

    def rollback_created(self) -> list[str]:
        """Remove only unchanged, empty directories created by this patch."""
        failures: list[str] = []
        for record in reversed(self._created):
            parent_fd = record["parent_fd"]
            name = record["name"]
            label = record["label"]
            try:
                current = _entry_info(parent_fd, name)
                if current is None:
                    continue
                expected = record["expected"]
                if (
                    expected is None
                    or not stat.S_ISDIR(current.st_mode)
                    or (current.st_dev, current.st_ino) != expected
                ):
                    failures.append(
                        f"created directory {label}: refused to remove a replaced path"
                    )
                    continue
                os.rmdir(name, dir_fd=parent_fd)
                os.fsync(parent_fd)
            except OSError as exc:
                failures.append(
                    f"created directory {label}: {type(exc).__name__}: {exc}"
                )
        self._created.clear()
        return failures

    def display(self, parent_label: str, name: str) -> str:
        relative = f"{parent_label}/{name}" if parent_label else name
        return f"{self.root_value}/{relative}" if self.root_value != "/" else f"/{relative}"

    def close(self) -> None:
        for fd in reversed(list(self._fds.values())):
            try:
                os.close(fd)
            except OSError:
                pass
        self._fds.clear()


def _fingerprint(info: os.stat_result) -> tuple[int, int, int, int, int, int, int, int]:
    return (
        info.st_dev,
        info.st_ino,
        info.st_size,
        info.st_mtime_ns,
        info.st_ctime_ns,
        stat.S_IMODE(info.st_mode),
        info.st_uid,
        info.st_gid,
    )


def _read_fd(fd: int) -> bytes:
    os.lseek(fd, 0, os.SEEK_SET)
    chunks: list[bytes] = []
    while True:
        chunk = os.read(fd, 1024 * 1024)
        if not chunk:
            break
        chunks.append(chunk)
    return b"".join(chunks)


def _open_regular_at(parent_fd: int, name: str, relative: str) -> dict[str, Any]:
    try:
        fd = os.open(name, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW, dir_fd=parent_fd)
    except FileNotFoundError:
        raise PatchError(f"file does not exist: {relative}") from None
    except OSError as exc:
        raise PatchError(f"target must be a regular non-symlink file: {relative}") from exc
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise PatchError(f"target must be a regular non-symlink file: {relative}")
        data = _read_fd(fd)
        after = os.fstat(fd)
        if _fingerprint(before) != _fingerprint(after):
            raise PatchError(f"source changed while it was being read: {relative}")
        return {
            "fd": fd,
            "data": data,
            "fingerprint": _fingerprint(after),
            "mode": stat.S_IMODE(after.st_mode),
            "uid": after.st_uid,
            "gid": after.st_gid,
        }
    except BaseException:
        os.close(fd)
        raise


def _entry_info(parent_fd: int, name: str) -> os.stat_result | None:
    try:
        return os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        return None


def _entry_missing(parent_fd: int, name: str) -> bool:
    return _entry_info(parent_fd, name) is None


def _same_inode_as_fd(parent_fd: int, name: str, fd: int) -> bool:
    current = _entry_info(parent_fd, name)
    if current is None:
        return False
    try:
        expected = os.fstat(fd)
    except OSError:
        return False
    return (
        stat.S_ISREG(current.st_mode)
        and current.st_dev == expected.st_dev
        and current.st_ino == expected.st_ino
    )


def _path_matches_snapshot(
    parent_fd: int,
    name: str,
    snapshot: dict[str, Any],
) -> bool:
    if not _same_inode_as_fd(parent_fd, name, snapshot["fd"]):
        return False
    try:
        before = os.fstat(snapshot["fd"])
        data = _read_fd(snapshot["fd"])
        after = os.fstat(snapshot["fd"])
    except OSError:
        return False
    return (
        _fingerprint(before) == _fingerprint(after) == snapshot["fingerprint"]
        and data == snapshot["data"]
    )


def _write_all(fd: int, data: bytes) -> None:
    view = memoryview(data)
    offset = 0
    while offset < len(view):
        written = os.write(fd, view[offset:])
        if written <= 0:
            raise OSError("short write while staging patch content")
        offset += written


def _private_temp(
    directories: _DirectoryRegistry,
    parent_fd: int,
    parent_label: str,
    data: bytes,
    uid: int,
    gid: int,
) -> dict[str, Any]:
    """Create one unpredictable named stage, independently forced to mode 0600."""
    fd = -1
    name = ""
    for _ in range(128):
        name = f".odin-patch-stage-{secrets.token_hex(16)}"
        try:
            fd = os.open(
                name,
                os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC | os.O_NOFOLLOW,
                0o600,
                dir_fd=parent_fd,
            )
            break
        except FileExistsError:
            continue
    if fd < 0:
        raise PatchError("could not allocate an unpredictable private staging file")

    label = directories.display(parent_label, name)
    try:
        os.fchmod(fd, 0o600)
        _write_all(fd, data)
        os.fsync(fd)
        current = os.fstat(fd)
        if (current.st_uid, current.st_gid) != (uid, gid):
            os.fchown(fd, uid, gid)
        # chown may clear mode bits; the named stage remains exactly 0600.
        os.fchmod(fd, 0o600)
    except BaseException as original:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            os.unlink(name, dir_fd=parent_fd)
        except OSError as cleanup_exc:
            raise PatchRollbackError(
                original,
                [f"private staging artifact could not be removed: {label}: {cleanup_exc}"],
                [label],
            ) from original
        raise
    return {
        "fd": fd,
        "parent_fd": parent_fd,
        "name": name,
        "label": label,
        "named": True,
    }


def _new_recovery_slot(
    directories: _DirectoryRegistry,
    parent_fd: int,
    parent_label: str,
) -> dict[str, Any]:
    for _ in range(128):
        name = f".odin-patch-recovery-{secrets.token_hex(16)}"
        if _entry_missing(parent_fd, name):
            return {
                "parent_fd": parent_fd,
                "name": name,
                "label": directories.display(parent_label, name),
                "named": False,
            }
    raise PatchError("could not allocate an unpredictable recovery name")


def _rename_noreplace(
    source: str,
    destination: str,
    *,
    src_dir_fd: int,
    dst_dir_fd: int,
) -> None:
    """Linux renameat2(RENAME_NOREPLACE), with no unsafe emulation fallback."""
    import ctypes
    import errno

    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    if renameat2 is None:
        raise PatchError("apply_patch requires renameat2(RENAME_NOREPLACE) on the target host")
    renameat2.argtypes = [
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_int,
        ctypes.c_char_p,
        ctypes.c_uint,
    ]
    renameat2.restype = ctypes.c_int
    result = renameat2(
        src_dir_fd,
        os.fsencode(source),
        dst_dir_fd,
        os.fsencode(destination),
        1,
    )
    if result != 0:
        code = ctypes.get_errno()
        if code in {errno.ENOSYS, errno.EINVAL, errno.ENOTSUP}:
            raise PatchError(
                "target filesystem lacks the atomic no-replace rename required by apply_patch"
            )
        raise OSError(code, os.strerror(code), destination)


def _durable_rename_noreplace(
    source: str,
    destination: str,
    *,
    src_dir_fd: int,
    dst_dir_fd: int,
    rename_noreplace: Callable[..., None],
) -> None:
    """Publish atomically, then durably persist both affected directory entries."""
    rename_noreplace(
        source,
        destination,
        src_dir_fd=src_dir_fd,
        dst_dir_fd=dst_dir_fd,
    )
    os.fsync(dst_dir_fd)
    if src_dir_fd != dst_dir_fd:
        os.fsync(src_dir_fd)


def _remove_named(artifact: dict[str, Any]) -> None:
    if not artifact.get("named"):
        return
    os.unlink(artifact["name"], dir_fd=artifact["parent_fd"])
    artifact["named"] = False


def _artifact_exists(artifact: dict[str, Any]) -> bool:
    return bool(
        artifact.get("named") and not _entry_missing(artifact["parent_fd"], artifact["name"])
    )


def _artifact_paths(prepared: list[dict[str, Any]], stages: list[dict[str, Any]]) -> list[str]:
    paths: list[str] = []
    for item in prepared:
        slot = item.get("recovery")
        if slot is not None and _artifact_exists(slot):
            info = _entry_info(slot["parent_fd"], slot["name"])
            if info is not None and stat.S_ISREG(info.st_mode):
                os.chmod(slot["name"], 0o600, dir_fd=slot["parent_fd"], follow_symlinks=False)
                paths.append(slot["label"])
    for stage in stages:
        if _artifact_exists(stage):
            info = _entry_info(stage["parent_fd"], stage["name"])
            if info is not None and stat.S_ISREG(info.st_mode):
                os.chmod(stage["name"], 0o600, dir_fd=stage["parent_fd"], follow_symlinks=False)
                paths.append(stage["label"])
    return paths


def _cleanup_named(artifacts: list[dict[str, Any]]) -> list[str]:
    failures: list[str] = []
    for artifact in artifacts:
        if not artifact.get("named"):
            continue
        try:
            _remove_named(artifact)
        except OSError as exc:
            failures.append(f"{artifact['label']}: {type(exc).__name__}: {exc}")
    return failures


def _rollback_record(
    item: dict[str, Any],
    *,
    rename_noreplace: Callable[..., None],
) -> list[str]:
    failures: list[str] = []

    def fail(label: str, detail: BaseException | str) -> None:
        text = detail if isinstance(detail, str) else f"{type(detail).__name__}: {detail}"
        failures.append(f"{item['path']} ({label}): {text}")

    destination = item["destination"]
    stage = item.get("stage")
    if stage is not None and not stage.get("named"):
        try:
            if _same_inode_as_fd(destination["parent_fd"], destination["name"], stage["fd"]):
                os.unlink(destination["name"], dir_fd=destination["parent_fd"])
                stage["named"] = False
            elif not _entry_missing(destination["parent_fd"], destination["name"]):
                fail("destination", "refused to delete a destination not published by this patch")
        except BaseException as exc:
            fail("destination", exc)

    snapshot = item.get("snapshot")
    if snapshot is not None:
        source = item["source"]
        recovery = item.get("recovery")
        try:
            if _same_inode_as_fd(source["parent_fd"], source["name"], snapshot["fd"]):
                os.fchmod(snapshot["fd"], snapshot["mode"])
                if recovery is not None:
                    recovery["named"] = False
            elif (
                recovery is not None
                and recovery.get("named")
                and _entry_missing(source["parent_fd"], source["name"])
            ):
                os.fchmod(snapshot["fd"], snapshot["mode"])
                _durable_rename_noreplace(
                    recovery["name"],
                    source["name"],
                    src_dir_fd=recovery["parent_fd"],
                    dst_dir_fd=source["parent_fd"],
                    rename_noreplace=rename_noreplace,
                )
                recovery["named"] = False
            else:
                fail("source", "could not restore source without overwriting an external change")
        except BaseException as exc:
            fail("source", exc)

    return failures


def apply_plan(
    root_value: object,
    plan: object,
    *,
    rename_noreplace: Callable[..., None] = _rename_noreplace,
) -> list[str]:
    """Validate, privately stage, and apply a compensating multi-file transaction."""
    operations = _validated_plan(plan)
    directories = _DirectoryRegistry(root_value, rename_noreplace=rename_noreplace)
    prepared: list[dict[str, Any]] = []
    stages: list[dict[str, Any]] = []
    preserve_artifacts = False
    keep_created_directories = False
    try:
        # Semantic phase: hold parent/source descriptors, snapshot every source,
        # and derive every output before creating a directory, stage, or target.
        for op in operations:
            action = op["action"]
            if action == "add":
                existing = directories.existing_parent(op["path"])
                source = None
                if existing is not None:
                    source_parent_fd, source_name, source_parent_label = existing
                    if not _entry_missing(source_parent_fd, source_name):
                        raise PatchError(f"Add File target already exists: {op['path']}")
                    source = {
                        "parent_fd": source_parent_fd,
                        "name": source_name,
                        "parent_label": source_parent_label,
                    }
                prepared.append(
                    {
                        **op,
                        "source": source,
                        "destination": source,
                        "snapshot": None,
                        "new": op["content"].encode("utf-8", errors="strict"),
                        "mode": 0o644,
                        "uid": os.geteuid(),
                        "gid": os.getegid(),
                    }
                )
                continue

            existing = directories.existing_parent(op["path"])
            if existing is None:
                raise PatchError(
                    f"parent directory is missing, not a directory, or a symlink: {op['path']}"
                )
            source_parent_fd, source_name, source_parent_label = existing
            source = {
                "parent_fd": source_parent_fd,
                "name": source_name,
                "parent_label": source_parent_label,
            }
            snapshot = _open_regular_at(source_parent_fd, source_name, op["path"])
            if action == "delete":
                new = None
                destination = None
            else:
                try:
                    source_text = snapshot["data"].decode("utf-8", errors="strict")
                except UnicodeDecodeError as exc:
                    raise PatchError(f"Update File requires UTF-8 text: {op['path']}") from exc
                new = _apply_hunks(op["path"], source_text, op["hunks"]).encode("utf-8")
                destination = source
                if op["move_to"] is not None:
                    destination = None
                    existing_destination = directories.existing_parent(op["move_to"])
                    if existing_destination is not None:
                        destination_parent_fd, destination_name, destination_parent_label = (
                            existing_destination
                        )
                        if not _entry_missing(destination_parent_fd, destination_name):
                            raise PatchError(f"Move to target already exists: {op['move_to']}")
                        destination = {
                            "parent_fd": destination_parent_fd,
                            "name": destination_name,
                            "parent_label": destination_parent_label,
                        }
            prepared.append(
                {
                    **op,
                    "source": source,
                    "destination": destination,
                    "snapshot": snapshot,
                    "new": new,
                    "mode": snapshot["mode"],
                    "uid": snapshot["uid"],
                    "gid": snapshot["gid"],
                }
            )

        # Only Add and Move destinations may create parents. This occurs after
        # all source reads and hunk matching, so any semantic failure leaves no
        # directory behind.
        for item in prepared:
            if item["action"] == "add" and item["source"] is None:
                parent_fd, name, parent_label = directories.parent(
                    item["path"], create_missing=True
                )
                endpoint = {"parent_fd": parent_fd, "name": name, "parent_label": parent_label}
                item["source"] = endpoint
                item["destination"] = endpoint
            elif item["action"] == "update" and item["destination"] is None:
                parent_fd, name, parent_label = directories.parent(
                    item["move_to"], create_missing=True
                )
                item["destination"] = {
                    "parent_fd": parent_fd,
                    "name": name,
                    "parent_label": parent_label,
                }

        # Staging phase: every new-content artifact is O_EXCL, unpredictable,
        # and forced to mode 0600 independent of the target process umask.
        for item in prepared:
            if item["new"] is None:
                continue
            destination = item["destination"]
            stage = _private_temp(
                directories,
                destination["parent_fd"],
                destination["parent_label"],
                item["new"],
                item["uid"],
                item["gid"],
            )
            item["stage"] = stage
            stages.append(stage)

        # Whole-plan validation is repeated after staging, still before any
        # target is changed. Commit repeats each condition around its effect.
        for item in prepared:
            source = item["source"]
            snapshot = item["snapshot"]
            if snapshot is None:
                if not _entry_missing(source["parent_fd"], source["name"]):
                    raise PatchError(f"target changed while staging: {item['path']}")
            elif not _path_matches_snapshot(source["parent_fd"], source["name"], snapshot):
                raise PatchError(f"source changed while staging: {item['path']}")
            destination = item["destination"]
            if destination is not None and destination is not source:
                if not _entry_missing(destination["parent_fd"], destination["name"]):
                    raise PatchError(f"destination changed while staging: {item['move_to']}")

        committed: list[dict[str, Any]] = []
        try:
            for item in prepared:
                source = item["source"]
                snapshot = item["snapshot"]
                destination = item["destination"]
                if snapshot is None:
                    if not _entry_missing(source["parent_fd"], source["name"]):
                        raise PatchError(f"target changed before commit: {item['path']}")
                elif not _path_matches_snapshot(source["parent_fd"], source["name"], snapshot):
                    raise PatchError(f"source changed before commit: {item['path']}")
                if destination is not None and destination is not source:
                    if not _entry_missing(destination["parent_fd"], destination["name"]):
                        raise PatchError(f"destination changed before commit: {item['move_to']}")

                # Register before the first effect. A failure-injection wrapper
                # may raise after a successful syscall; rollback inspects disk.
                committed.append(item)
                if snapshot is not None:
                    recovery = _new_recovery_slot(
                        directories, source["parent_fd"], source["parent_label"]
                    )
                    item["recovery"] = recovery
                    os.fchmod(snapshot["fd"], 0o600)
                    try:
                        _durable_rename_noreplace(
                            source["name"],
                            recovery["name"],
                            src_dir_fd=source["parent_fd"],
                            dst_dir_fd=recovery["parent_fd"],
                            rename_noreplace=rename_noreplace,
                        )
                    finally:
                        recovery["named"] = not _entry_missing(
                            recovery["parent_fd"], recovery["name"]
                        )
                    if not _same_inode_as_fd(
                        recovery["parent_fd"], recovery["name"], snapshot["fd"]
                    ):
                        raise PatchError(f"source changed during commit: {item['path']}")

                commit_stage = item.get("stage")
                if commit_stage is not None:
                    try:
                        _durable_rename_noreplace(
                            commit_stage["name"],
                            destination["name"],
                            src_dir_fd=commit_stage["parent_fd"],
                            dst_dir_fd=destination["parent_fd"],
                            rename_noreplace=rename_noreplace,
                        )
                    finally:
                        commit_stage["named"] = not _entry_missing(
                            commit_stage["parent_fd"], commit_stage["name"]
                        )
                    if not _same_inode_as_fd(
                        destination["parent_fd"], destination["name"], commit_stage["fd"]
                    ):
                        raise PatchError(
                            "destination changed during commit: "
                            f"{item.get('move_to') or item['path']}"
                        )
                    os.fchmod(commit_stage["fd"], item["mode"])
        except BaseException as original:
            rollback_failures: list[str] = []
            for item in reversed(committed):
                rollback_failures.extend(_rollback_record(item, rename_noreplace=rename_noreplace))
            if rollback_failures:
                preserve_artifacts = True
                artifacts = _artifact_paths(prepared, stages)
                raise PatchRollbackError(original, rollback_failures, artifacts) from original
            cleanup_failures = _cleanup_named(stages)
            if cleanup_failures:
                preserve_artifacts = True
                artifacts = _artifact_paths(prepared, stages)
                raise PatchRollbackError(original, cleanup_failures, artifacts) from original
            raise PatchError(
                f"commit failed; rollback completed: {type(original).__name__}: {original}"
            ) from original

        recovery_slots = [item["recovery"] for item in prepared if item.get("recovery")]
        cleanup_failures = _cleanup_named(recovery_slots + stages)
        if cleanup_failures:
            preserve_artifacts = True
            artifacts = _artifact_paths(prepared, stages)
            raise PatchRollbackError(
                PatchError("patch committed but private-artifact cleanup failed"),
                cleanup_failures,
                artifacts,
            )
        keep_created_directories = True
        return [
            item["path"] if item.get("move_to") is None else f"{item['path']} -> {item['move_to']}"
            for item in prepared
        ]
    except BaseException as original:
        if not preserve_artifacts:
            named_artifacts = [
                item["recovery"] for item in prepared if item.get("recovery")
            ] + stages
            cleanup_failures = _cleanup_named(named_artifacts)
            directory_failures = directories.rollback_created()
            if cleanup_failures or directory_failures:
                retained = _artifact_paths(prepared, stages)
                raise PatchRollbackError(
                    original,
                    cleanup_failures + directory_failures,
                    retained,
                ) from original
        raise
    finally:
        if not preserve_artifacts:
            _cleanup_named([item["recovery"] for item in prepared if item.get("recovery")] + stages)
        if not keep_created_directories and not preserve_artifacts:
            directories.rollback_created()
        for item in prepared:
            final_snapshot = item.get("snapshot")
            if final_snapshot is not None:
                try:
                    os.close(final_snapshot["fd"])
                except OSError:
                    pass
        for stage in stages:
            try:
                os.close(stage["fd"])
            except OSError:
                pass
        directories.close()
