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
import stat
import tempfile
from collections.abc import Callable
from pathlib import Path, PurePosixPath
from typing import Any

BEGIN_PATCH = "*** Begin Patch"
END_PATCH = "*** End Patch"
ADD_FILE = "*** Add File: "
UPDATE_FILE = "*** Update File: "
DELETE_FILE = "*** Delete File: "
MOVE_TO = "*** Move to: "
MAX_PATCH_BYTES = 512 * 1024


class PatchError(ValueError):
    """The patch is malformed, stale, unsafe, or could not be committed."""


class PatchRollbackError(PatchError):
    """A commit failed and one or more rollback operations also failed."""

    def __init__(self, original: BaseException, failures: list[str]) -> None:
        super().__init__(f"commit failed ({original}); rollback also failed: {'; '.join(failures)}")
        self.original = original
        self.failures = failures


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
                if marker != "@@" and not marker.startswith("@@ "):
                    raise PatchError(f"Update File {path}: expected an @@ hunk, got {marker!r}")
                anchor = marker[3:] if marker.startswith("@@ ") else None
                if anchor == "":
                    raise PatchError(f"Update File {path}: empty @@ anchor")
                index += 1
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
                            f"Update File {path}: hunk lines must start with space, '+', or '-'"
                        )
                    changed = changed or line[0] in "+-"
                    hunk_lines.append(line)
                    index += 1
                if not hunk_lines or not changed:
                    raise PatchError(f"Update File {path}: every hunk must contain a change")
                hunks.append({"anchor": anchor, "lines": hunk_lines})
            if not hunks:
                raise PatchError(f"Update File {path}: at least one @@ hunk is required")
            operations.append(
                {"action": "update", "path": path, "move_to": move_to, "hunks": hunks}
            )
            continue

        raise PatchError(f"unexpected patch line: {header!r}")

    if not operations:
        raise PatchError("patch must contain at least one file operation")
    return {"version": 1, "operations": operations}


def _validated_plan(plan: object) -> list[dict[str, Any]]:
    """Validate the transported plan independently of the model-side parser."""
    if not isinstance(plan, dict) or set(plan) != {"version", "operations"} or plan["version"] != 1:
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
                if not isinstance(hunk, dict) or set(hunk) != {"anchor", "lines"}:
                    raise PatchError("invalid transported update hunk")
                anchor = hunk["anchor"]
                hunk_lines = hunk["lines"]
                if anchor is not None and not isinstance(anchor, str):
                    raise PatchError("invalid transported hunk anchor")
                if (
                    not isinstance(hunk_lines, list)
                    or not hunk_lines
                    or not all(
                        isinstance(line, str) and line and line[0] in " +-" for line in hunk_lines
                    )
                    or not any(line[0] in "+-" for line in hunk_lines)
                ):
                    raise PatchError("invalid transported hunk lines")
                clean_hunks.append({"anchor": anchor, "lines": hunk_lines})
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


def _apply_hunks(path: str, source: str, hunks: list[dict[str, Any]]) -> str:
    had_final_newline = source.endswith(("\n", "\r"))
    newline = "\r\n" if "\n" in source and source.count("\r\n") == source.count("\n") else "\n"
    lines = source.splitlines()
    cursor = 0
    for hunk in hunks:
        anchor = hunk["anchor"]
        if anchor is not None:
            anchor_at = _find_unique(lines, [anchor], cursor, path)
            cursor = anchor_at
        old_lines = [line[1:] for line in hunk["lines"] if line[0] in " -"]
        new_lines = [line[1:] for line in hunk["lines"] if line[0] in " +"]
        if old_lines:
            at = _find_unique(lines, old_lines, cursor, path)
        elif anchor is not None:
            at = cursor
        else:
            at = len(lines)
        lines[at : at + len(old_lines)] = new_lines
        cursor = at + len(new_lines)
    result = newline.join(lines)
    if had_final_newline:
        result += newline
    return result


def _target(root: Path, relative: str) -> Path:
    candidate = root.joinpath(*PurePosixPath(relative).parts)
    current = root
    for part in PurePosixPath(relative).parts[:-1]:
        current = current / part
        if current.exists() or current.is_symlink():
            info = os.lstat(current)
            if stat.S_ISLNK(info.st_mode):
                raise PatchError(f"symlink path component is not allowed: {relative}")
            if not stat.S_ISDIR(info.st_mode):
                raise PatchError(f"non-directory path component: {relative}")
    parent = candidate.parent
    if not parent.is_dir():
        raise PatchError(f"parent directory does not exist: {relative}")
    resolved_parent = parent.resolve(strict=True)
    try:
        resolved_parent.relative_to(root)
    except ValueError as exc:
        raise PatchError(f"path escapes root: {relative}") from exc
    return candidate


def _private_temp(parent: Path, data: bytes, prefix: str) -> Path:
    fd, raw_path = tempfile.mkstemp(prefix=prefix, dir=parent)
    path = Path(raw_path)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        try:
            os.close(fd)
        except OSError:
            pass
        try:
            path.unlink()
        except OSError:
            pass
        raise
    return path


def _regular_file(path: Path, relative: str) -> os.stat_result:
    try:
        info = os.lstat(path)
    except FileNotFoundError as exc:
        raise PatchError(f"file does not exist: {relative}") from exc
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        raise PatchError(f"target must be a regular file, not a symlink: {relative}")
    return info


def apply_plan(
    root_value: object,
    plan: object,
    *,
    replace: Callable[
        [
            str | bytes | os.PathLike[str] | os.PathLike[bytes],
            str | bytes | os.PathLike[str] | os.PathLike[bytes],
        ],
        None,
    ] = os.replace,
    unlink: Callable[[str | bytes | os.PathLike[str] | os.PathLike[bytes]], None] = os.unlink,
    chmod: Callable[[str | bytes | os.PathLike[str] | os.PathLike[bytes], int], None] = os.chmod,
    chown: Callable[
        [str | bytes | os.PathLike[str] | os.PathLike[bytes], int, int], None
    ] = os.chown,
) -> list[str]:
    """Validate, stage, and transactionally apply a transported patch plan."""
    if not isinstance(root_value, str) or not root_value.startswith("/") or "\x00" in root_value:
        raise PatchError("root must be an absolute path")
    root = Path(root_value)
    if root.is_symlink() or not root.is_dir():
        raise PatchError("root must be an existing non-symlink directory")
    root = root.resolve(strict=True)
    operations = _validated_plan(plan)

    prepared: list[dict[str, Any]] = []
    # Semantic phase: resolve every path, snapshot every source, derive every
    # output, and reject stale/ambiguous context before creating any temp file.
    for op in operations:
        action = op["action"]
        relative = op["path"]
        source_path = _target(root, relative)
        if action == "add":
            if source_path.exists() or source_path.is_symlink():
                raise PatchError(f"Add File target already exists: {relative}")
            content = op["content"].encode("utf-8", errors="strict")
            prepared.append(
                {
                    **op,
                    "source": source_path,
                    "destination": source_path,
                    "new": content,
                    "old": None,
                    "mode": 0o644,
                    "uid": os.geteuid(),
                    "gid": os.getegid(),
                }
            )
            continue

        info = _regular_file(source_path, relative)
        old = source_path.read_bytes()
        if action == "delete":
            prepared.append(
                {
                    **op,
                    "source": source_path,
                    "destination": None,
                    "new": None,
                    "old": old,
                    "mode": stat.S_IMODE(info.st_mode),
                    "uid": info.st_uid,
                    "gid": info.st_gid,
                }
            )
            continue

        try:
            source_text = old.decode("utf-8", errors="strict")
        except UnicodeDecodeError as exc:
            raise PatchError(f"Update File requires UTF-8 text: {relative}") from exc
        new = _apply_hunks(relative, source_text, op["hunks"]).encode("utf-8")
        destination = source_path
        if op["move_to"] is not None:
            destination = _target(root, op["move_to"])
            if destination.exists() or destination.is_symlink():
                raise PatchError(f"Move to target already exists: {op['move_to']}")
        prepared.append(
            {
                **op,
                "source": source_path,
                "destination": destination,
                "new": new,
                "old": old,
                "mode": stat.S_IMODE(info.st_mode),
                "uid": info.st_uid,
                "gid": info.st_gid,
            }
        )

    staged: list[Path] = []
    backups: dict[Path, Path] = {}
    try:
        for item in prepared:
            if item["old"] is not None:
                backup = _private_temp(item["source"].parent, item["old"], ".odin-patch-backup-")
                chown(backup, item["uid"], item["gid"])
                backups[item["source"]] = backup
                staged.append(backup)
            if item["new"] is not None:
                temp = _private_temp(item["destination"].parent, item["new"], ".odin-patch-stage-")
                chown(temp, item["uid"], item["gid"])
                item["stage"] = temp
                staged.append(temp)

        # Recheck every precondition after staging. A concurrent edit during
        # semantic planning must not be overwritten on stale context.
        for item in prepared:
            source = item["source"]
            if item["old"] is None:
                if source.exists() or source.is_symlink():
                    raise PatchError(f"target changed while staging: {item['path']}")
            elif not source.is_file() or source.is_symlink() or source.read_bytes() != item["old"]:
                raise PatchError(f"source changed while staging: {item['path']}")
            destination = item["destination"]
            if (
                destination is not None
                and destination != source
                and (destination.exists() or destination.is_symlink())
            ):
                raise PatchError(f"destination changed while staging: {item['move_to']}")

        committed: list[dict[str, Any]] = []
        try:
            for item in prepared:
                action = item["action"]
                source = item["source"]
                destination = item["destination"]
                if action == "delete":
                    unlink(source)
                    committed.append({"kind": "delete", "item": item})
                elif action == "add":
                    record = {"kind": "add", "item": item}
                    replace(item["stage"], destination)
                    committed.append(record)
                    chmod(destination, item["mode"])
                elif destination == source:
                    record = {"kind": "update", "item": item}
                    replace(item["stage"], source)
                    committed.append(record)
                    chmod(source, item["mode"])
                else:
                    record = {"kind": "move", "item": item, "source_removed": False}
                    replace(item["stage"], destination)
                    committed.append(record)
                    chmod(destination, item["mode"])
                    unlink(source)
                    record["source_removed"] = True
        except BaseException as original:
            rollback_failures: list[str] = []
            for record in reversed(committed):
                item = record["item"]
                source = item["source"]
                destination = item["destination"]
                try:
                    if record["kind"] == "add":
                        unlink(destination)
                    elif record["kind"] in {"update", "delete"}:
                        replace(backups[source], source)
                        chmod(source, item["mode"])
                    else:
                        if destination.exists() or destination.is_symlink():
                            unlink(destination)
                        if record["source_removed"]:
                            replace(backups[source], source)
                            chmod(source, item["mode"])
                except BaseException as rollback_exc:
                    rollback_failures.append(
                        f"{item['path']}: {type(rollback_exc).__name__}: {rollback_exc}"
                    )
            if rollback_failures:
                raise PatchRollbackError(original, rollback_failures) from original
            raise PatchError(
                f"commit failed; rollback completed: {type(original).__name__}: {original}"
            ) from original

        return [
            item["path"] if item.get("move_to") is None else f"{item['path']} -> {item['move_to']}"
            for item in prepared
        ]
    finally:
        for path in staged:
            try:
                path.unlink()
            except FileNotFoundError:
                pass
            except OSError:
                pass
