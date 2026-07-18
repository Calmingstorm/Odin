"""Corruption-safe loading for the small JSON stores (working memory, learned
memory, skill memory).

The failure this prevents: every store's loader returned an EMPTY store on ANY
read/parse error, and the next save wrote that empty store back — silently
wiping the whole corpus while reporting success. A single transient read
failure or a hand-edit typo could erase everything Odin remembers.

Two entry points split the decision:

* ``load_json_store`` — for MUTATION paths. A missing file is an empty store,
  but an unreadable / malformed / wrong-shape file raises ``StoreCorruptError``
  so the caller REFUSES to overwrite. A timestamped copy of the corrupt bytes
  is preserved (non-clobbering); the live file is never touched.
* ``load_json_store_safe`` — for READ paths (prompt injection). Corruption
  degrades to the empty default so a damaged file can never take chat down.

Only EXPECTED read / decode / JSON / shape failures are treated as corruption;
an unexpected programming error still propagates.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from .odin_log import get_logger

log = get_logger("json_store")


class StoreCorruptError(Exception):
    """A JSON store exists but is unreadable, malformed, or the wrong shape.

    Mutation paths must refuse (not overwrite); read paths must degrade.
    """


def _backup_corrupt(path: Path, raw: bytes) -> None:
    """Preserve a timestamped copy of corrupt bytes WITHOUT touching the
    original. Best-effort and non-clobbering (one backup per second)."""
    try:
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        dest = path.with_name(f"{path.name}.corrupt-{ts}")
        if not dest.exists():
            dest.write_bytes(raw)
            log.error("Preserved corrupt %s as %s (live file untouched)", path.name, dest.name)
    except OSError as exc:
        log.error("Could not back up corrupt %s: %s", path.name, exc)


def load_json_store(path: Path | None, *, container: type = dict, validate=None):
    """Strict load for MUTATION paths.

    Missing file -> empty ``container()``. Unreadable / invalid JSON / wrong
    top-level type -> back up a copy and raise ``StoreCorruptError`` so the
    caller refuses the mutation instead of overwriting the corpus.

    ``validate`` (optional) runs the caller's NESTED-shape check inside the
    corruption boundary: it receives the parsed data and raises
    ``StoreCorruptError`` on a malformed nested shape; the raw bytes are then
    backed up before the error propagates — so nested corruption gets the same
    sidecar backup as top-level corruption.
    """
    if path is None:
        return container()
    p = Path(path)
    if not p.exists():
        return container()
    try:
        raw = p.read_bytes()
    except OSError as exc:
        # Cannot read -> cannot back up and cannot know the contents; refuse
        # rather than assume the store is empty.
        raise StoreCorruptError(f"{p.name} is unreadable: {exc}") from exc
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        _backup_corrupt(p, raw)
        raise StoreCorruptError(f"{p.name} is not valid JSON: {exc}") from exc
    if not isinstance(data, container):
        _backup_corrupt(p, raw)
        raise StoreCorruptError(
            f"{p.name} has the wrong shape "
            f"(expected {container.__name__}, got {type(data).__name__})"
        )
    if validate is not None:
        try:
            validate(data)
        except StoreCorruptError:
            _backup_corrupt(p, raw)
            raise
    return data


def load_json_store_safe(
    path: Path | None, *, container: type = dict, what: str = "store", validate=None
) -> tuple:
    """Read-path load: corruption (top-level OR nested via ``validate``)
    degrades to the empty container (never raises), so a damaged store cannot
    crash the caller (e.g. prompt injection). Returns ``(data, ok)``; ``ok`` is
    False when corruption was hit so the caller can log at its own cadence."""
    try:
        return load_json_store(path, container=container, validate=validate), True
    except StoreCorruptError as exc:
        log.error("%s unavailable, degrading to empty: %s", what, exc)
        return container(), False
