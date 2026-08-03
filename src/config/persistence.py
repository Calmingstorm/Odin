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
# A leaf change: (path, value) or (path, value, other_accepted_spellings). The
# third element carries a field's legacy aliases so the writer can update the
# key the file already uses instead of adding a canonical sibling that pydantic
# would then ignore.
ConfigChange = (
    tuple[tuple[str, ...], Any] | tuple[tuple[str, ...], Any, tuple[str, ...]]
)


def _field_lookup(model_cls: Any) -> dict[str, tuple[str, Any, tuple[str, ...]]]:
    """``{accepted_key: (canonical_name, nested_model_or_None, other_spellings)}``.

    Pydantic accepts legacy spellings through ``validation_alias``
    (``search.chromadb_path`` → ``search_db_path``). A submitted alias must
    resolve to its canonical field, or the value is silently dropped: it is
    absent from the validated dump, so nothing persists it.
    """
    from pydantic import BaseModel

    fields = getattr(model_cls, "model_fields", None)
    if not fields:
        return {}
    out: dict[str, tuple[str, Any, tuple[str, ...]]] = {}
    for name, field in fields.items():
        annotation = field.annotation
        nested = (
            annotation
            if isinstance(annotation, type) and issubclass(annotation, BaseModel)
            else None
        )
        spellings = [name]
        for candidate in (field.validation_alias, field.alias):
            if isinstance(candidate, str) and candidate not in spellings:
                spellings.append(candidate)
        others = tuple(s for s in spellings if s != name)
        for spelling in spellings:
            out[spelling] = (name, nested, others)
    return out


def submitted_leaves(
    updates: Mapping[str, Any], validated: Mapping[str, Any], model_cls: Any = None
) -> list[ConfigChange]:
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

    When *model_cls* is given, submitted keys are resolved through the schema so
    legacy aliases land on their canonical field, and each emitted change also
    carries that field's other accepted spellings so the writer can update the
    key the file already uses.
    """
    out: list[ConfigChange] = []

    def walk(new: Mapping[str, Any], known: Any, model: Any, prefix: tuple[str, ...]) -> None:
        lookup = _field_lookup(model) if model is not None else {}
        for key, value in new.items():
            canonical, nested, aliases = lookup.get(str(key), (str(key), None, ()))
            path = (*prefix, canonical)
            if not isinstance(known, Mapping) or canonical not in known:
                # Validation dropped this path (unknown/removed field) — the
                # runtime ignores it, so disk must not carry it either.
                continue
            known_value = known[canonical]
            if isinstance(value, Mapping) and isinstance(known_value, Mapping):
                walk(value, known_value, nested, path)
            elif aliases:
                out.append((path, known_value, aliases))
            else:
                out.append((path, known_value))

    walk(updates, validated, model_cls, ())
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
    changes: Iterable[ConfigChange], *, path: Path | str | None = None
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

    for change in changes:
        segments, value = change[0], change[1]
        aliases: tuple[str, ...] = change[2] if len(change) > 2 else ()
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
        if hasattr(node, "get") and leaf not in node:
            # The file may spell this field with a legacy alias. Update THAT key
            # rather than adding the canonical name beside it: pydantic's
            # validation_alias wins on reload, so a canonical sibling would be
            # written and then ignored, silently reverting the change.
            for alias in aliases:
                if alias in node:
                    leaf = alias
                    break
        if _placeholder_still_accurate(node.get(leaf) if hasattr(node, "get") else None, value):
            # The file holds ${VAR} and the submitted value is just what that
            # placeholder already resolves to — a client that PUT back a whole
            # fetched document, not an operator changing anything. Keep the
            # placeholder; writing the resolved value would put the secret on
            # disk in plaintext.
            continue
        node[leaf] = value

    _dump_atomic(document, config_path, orig_mode)


async def _run_settled(write: Callable[[], None]) -> None:
    """Run a sync write to SETTLEMENT, cancellation-safe, then re-raise.

    ``asyncio.to_thread`` creates a Task: cancelling the awaiting coroutine
    returns immediately while the worker thread keeps running, so the caller's
    lock is released with a write still in flight — and that abandoned write
    can land after, and overwrite, a later one. An executor future is not a
    Task, so the repository's ``asyncio.all_tasks()`` shutdown drain cannot
    cancel it either; re-shielding through any cancellation keeps the caller
    inside the lock until the filesystem worker is genuinely done.

    ``fut.exception()`` is the ACTUAL thread result, so a cancelled caller is
    never mistaken for a successful write. This mirrors
    ``LLMGateway.run_persist_settled``, which fixed the same race on the LLM
    persistence path.
    """
    loop = asyncio.get_running_loop()
    fut = loop.run_in_executor(None, write)
    was_cancelled = False
    while not fut.done():
        try:
            await asyncio.shield(fut)
        except asyncio.CancelledError:
            was_cancelled = True
        except Exception:
            break  # worker raised; fut.done() is now True
    exc = fut.exception()
    if exc is not None:
        raise exc
    if was_cancelled:
        # State is coherent (the write finished) — now honor the cancellation.
        raise asyncio.CancelledError


def config_transaction():
    """Hold the shared config lock across a WHOLE mutation.

    Locking only the write is not enough. A config update reads
    ``bot.config``, validates a merged copy, persists, and rebinds
    ``bot.config`` — four steps. Two writers interleaving between the read and
    the rebind means the second one's snapshot predates the first one's change,
    so the rebind drops it from runtime while the leaf-scoped write leaves it
    on disk: runtime and disk silently disagree.

    Every config writer — the generic endpoint, the LLM routes, personality —
    takes THIS lock, so all four steps are serialized. Lock order is
    ``config_transaction()`` OUTER, provider_lock inner; never the reverse.

    Callers inside a transaction use :func:`persist_config_paths_locked` /
    :func:`persist_config_mutation_locked`, which skip re-acquiring it.
    """
    return config_write_lock


async def persist_config_paths_locked(
    changes: Iterable[ConfigChange], *, path: Path | str | None = None
) -> None:
    """Patch leaves to settlement. The caller already holds the lock."""
    changes = list(changes)
    if not changes:
        return
    await _run_settled(lambda: patch_config_paths(changes, path=path))


async def persist_config_paths(
    changes: Iterable[ConfigChange], *, path: Path | str | None = None
) -> None:
    """Patch leaves off the event loop, under the shared lock, to settlement."""
    changes = list(changes)
    if not changes:
        return
    async with config_write_lock:
        await _run_settled(lambda: patch_config_paths(changes, path=path))


async def persist_config_mutation(
    mutate: Callable[[Any], None], *, path: Path | str | None = None
) -> None:
    """Mutate the document off the event loop, under the shared lock, to settlement."""
    async with config_write_lock:
        await _run_settled(lambda: mutate_config_document(mutate, path=path))
