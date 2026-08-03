"""Shared configuration persistence — the one writer every config surface uses.

Three independent writers used to exist: the generic ``PUT /api/config`` path
(plain ``yaml.dump`` of the whole resolved model), the personality endpoints
(same dumper, against a CWD-relative path), and ``llm_admin``'s round-trip
section writer. Only the third was correct. The other two destroyed comments and
key ordering, materialized resolved ``${VAR}`` placeholders into plaintext on
disk, wrote non-atomically, and — because ``bot.config`` was already mutated —
reported success even when the write failed or the file did not exist.

This module generalizes the correct one:

* the target is always the file the live config was LOADED from
  (``active_config_path()``), never a CWD-relative guess;
* the document is edited in place with ruamel round-trip, so comments, ordering,
  quoting, anchors, and untouched ``${VAR}`` placeholders survive;
* only the leaves a caller actually changed are patched — an untouched
  placeholder is never rewritten, because it is never visited;
* the commit is atomic: temp file in the same directory, original mode restored,
  fsync, ``os.replace``, then a best-effort directory fsync;
* failure raises ``ConfigPersistError`` so a mutation endpoint fails loudly
  rather than claiming a phantom save.

``config_write_lock`` serializes every writer. Without one shared lock, a
generic save and an LLM save can interleave between load and write and silently
drop each other's changes.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import tempfile
from collections.abc import Callable, Iterable, Mapping, Sequence
from pathlib import Path
from typing import Any

from ..odin_log import get_logger
from .schema import active_config_path

log = get_logger("config.persistence")

# ONE lock for every config writer in the process (generic, LLM, personality,
# feature panels). Load-modify-write against a shared file is only safe when
# all writers queue behind the same lock.
config_write_lock = asyncio.Lock()


class ConfigPersistError(RuntimeError):
    """The config file could not be resolved, read, parsed, or written.

    Raised rather than logged-and-swallowed: a mutation endpoint that cannot
    persist must fail visibly, so the caller can roll back or report honestly
    instead of returning success for a change that dies at the next restart.
    """


ConfigPath = Sequence[str]


def submitted_leaves(
    updates: Mapping[str, Any], validated: Mapping[str, Any]
) -> list[tuple[tuple[str, ...], Any]]:
    """The leaves a caller submitted, carrying their VALIDATED values.

    Two properties matter, and they pull in opposite directions:

    * Only submitted paths are visited, so a field nobody touched is never
      rewritten — which is what keeps an unresolved ``${DISCORD_TOKEN}`` in the
      file instead of materializing the resolved secret (the writer adds a
      second guard for the round-trip case).
    * Values come from the validated model, never the raw request, so a
      submitted key the schema drops (a legacy ``model_routing`` block) is not
      persisted, and normalization the schema applies (blank workspace path →
      default) reaches disk exactly as it reached runtime.

    Lists are leaves: a submitted list replaces the stored one wholesale rather
    than being merged element-wise.
    """
    out: list[tuple[tuple[str, ...], Any]] = []

    def walk(new: Mapping[str, Any], known: Any, prefix: tuple[str, ...]) -> None:
        for key, value in new.items():
            path = (*prefix, str(key))
            if not isinstance(known, Mapping) or key not in known:
                # Validation dropped this path (unknown/removed field) — the
                # runtime ignores it, so disk must not carry it either.
                continue
            known_value = known[key]
            if isinstance(value, Mapping) and isinstance(known_value, Mapping):
                walk(value, known_value, path)
            else:
                out.append((path, known_value))

    walk(updates, validated, ())
    return out


def _placeholder_still_accurate(existing: Any, new_value: Any) -> bool:
    """True when *existing* is a ``${VAR}`` scalar that already resolves to
    *new_value* — i.e. writing the literal would leak a resolved secret while
    changing nothing.

    An unresolvable placeholder returns False: startup substitutes the whole
    file, so a missing variable would have failed the load, and guessing here
    would silently ignore a real edit.
    """
    if not isinstance(existing, str) or "${" not in existing:
        return False
    from .schema import _substitute_env_vars

    try:
        resolved = _substitute_env_vars(existing)
    except ValueError:
        return False
    # YAML scalars arrive as strings; the validated model has already coerced
    # them (port "3002" → 3002), so compare both ways.
    return resolved == new_value or resolved == str(new_value)


def _load_document(config_path: Path) -> tuple[Any, int]:
    """Round-trip load the config file. Returns (document, original mode)."""
    from ruamel.yaml import YAML

    ry = YAML()
    ry.preserve_quotes = True
    try:
        with open(config_path) as f:
            existing = ry.load(f)
    except Exception as exc:
        # Generic client-facing message: ruamel parse errors (duplicate-key in
        # particular) echo the conflicting VALUES, which in this file are
        # secrets. Detail goes to the log only.
        log.warning("config file parse failed: %s", type(exc).__name__)
        raise ConfigPersistError("config file unreadable or malformed") from None
    if existing is None:
        raise ConfigPersistError("config file is empty")
    return existing, os.stat(config_path).st_mode & 0o777


def _dump_atomic(document: Any, config_path: Path, orig_mode: int) -> None:
    """Serialize *document* over *config_path* atomically, preserving mode."""
    import io

    from ruamel.yaml import YAML

    ry = YAML()
    ry.preserve_quotes = True
    buf = io.StringIO()
    ry.dump(document, buf)

    parent = str(config_path.parent or ".")
    fd, tmp = tempfile.mkstemp(dir=parent, suffix=".yml.tmp")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(buf.getvalue())
            f.flush()
            os.fsync(f.fileno())
        # mkstemp creates 0600; os.replace would otherwise silently tighten the
        # live config's mode (typically 0664/0640) out from under the operator.
        os.chmod(tmp, orig_mode)
        os.replace(tmp, config_path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise
    # os.replace IS the commit point — the new config is on disk from here.
    # The directory fsync is a durability nicety only; letting its failure raise
    # would make callers roll back runtime state that disk already reflects.
    with contextlib.suppress(OSError):
        dir_fd = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)


def _resolve_path(path: Path | str | None) -> Path:
    if path is not None:
        return Path(path)
    resolved = active_config_path()
    if resolved is None:
        # A fabricated Config (a test double or one-off script that never called
        # load_config) has no active path. Refusing beats clobbering whatever
        # config.yml happens to sit in the current working directory.
        raise ConfigPersistError("refusing to persist a config not loaded from disk")
    return resolved


def mutate_config_document(
    mutate: Callable[[Any], None], *, path: Path | str | None = None
) -> None:
    """Load the active config round-trip, apply *mutate*, write it atomically.

    For callers that own a section and know exactly which keys they maintain
    (``llm_admin``'s LLM-section writer). Callers patching arbitrary paths
    should use :func:`patch_config_paths` instead.
    """
    config_path = _resolve_path(path)
    if not config_path.exists():
        raise ConfigPersistError("config file does not exist")
    document, orig_mode = _load_document(config_path)
    mutate(document)
    _dump_atomic(document, config_path, orig_mode)


def patch_config_paths(
    changes: Iterable[tuple[ConfigPath, Any]], *, path: Path | str | None = None
) -> None:
    """Apply leaf *changes* to the active config file, touching nothing else.

    Each change is a ``(path_segments, value)`` pair. Missing intermediate
    mappings are created. Everything the caller did not name — comments,
    ordering, sibling keys, unresolved ``${VAR}`` placeholders — is preserved
    exactly as written.
    """
    changes = list(changes)
    if not changes:
        return
    config_path = _resolve_path(path)
    if not config_path.exists():
        raise ConfigPersistError("config file does not exist")
    document, orig_mode = _load_document(config_path)

    for segments, value in changes:
        if not segments:
            continue
        node = document
        for segment in segments[:-1]:
            child = node.get(segment) if hasattr(node, "get") else None
            if not isinstance(child, dict):
                # ruamel maps are dict subclasses; a plain dict inserted here
                # round-trips fine as a new block.
                child = {}
                node[segment] = child
            node = child
        leaf = segments[-1]
        if _placeholder_still_accurate(node.get(leaf) if hasattr(node, "get") else None, value):
            # The file holds ${VAR} and the submitted value is just what that
            # placeholder already resolves to — a client that PUT back a whole
            # fetched document, not an operator changing anything. Keep the
            # placeholder; writing the resolved value would put the secret on
            # disk in plaintext.
            continue
        node[leaf] = value

    _dump_atomic(document, config_path, orig_mode)


async def persist_config_paths(
    changes: Iterable[tuple[ConfigPath, Any]], *, path: Path | str | None = None
) -> None:
    """Async wrapper: patch leaves off the event loop, under the shared lock."""
    changes = list(changes)
    if not changes:
        return
    async with config_write_lock:
        await asyncio.to_thread(patch_config_paths, changes, path=path)


async def persist_config_mutation(
    mutate: Callable[[Any], None], *, path: Path | str | None = None
) -> None:
    """Async wrapper: document mutation off the event loop, under the shared lock."""
    async with config_write_lock:
        await asyncio.to_thread(mutate_config_document, mutate, path=path)
