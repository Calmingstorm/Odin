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

``config_transaction()`` serializes every writer. Without one shared lock, a
generic save and an LLM save can interleave between load and write and silently
drop each other's changes.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import shutil
import tempfile
import threading
import weakref
from collections.abc import Callable, Iterable, Mapping, MutableMapping, Sequence
from pathlib import Path
from typing import Any

from ..odin_log import get_logger
from .schema import active_config_path

log = get_logger("config.persistence")

# ONE lock for every config writer (generic, LLM, personality, feature panels):
# load-modify-write against a shared file is only safe when all writers queue
# behind the same lock.
#
# Created PER EVENT LOOP rather than at import. An asyncio.Lock binds to the
# loop that first awaits it, so a module-level singleton reaching a second loop
# raises "is bound to a different event loop" — and if the first loop died
# holding it, it arrives permanently locked. Keyed weakly so a finished loop's
# lock is collected with it.
_loop_locks: MutableMapping[Any, asyncio.Lock] = weakref.WeakKeyDictionary()


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
ConfigChange = tuple[tuple[str, ...], Any] | tuple[tuple[str, ...], Any, tuple[str, ...]]
PersistOutcome = tuple[BaseException | None, bool]


class _DeleteConfigPath:
    """Sentinel for deleting one explicitly named config path.

    The persistence contract is leaf-scoped: callers must name every value
    they intend to change, including removals.  A sentinel avoids overloading
    ``None`` (which is a valid YAML scalar) and lets the round-trip writer
    preserve every untouched sibling and ``${ENV}`` placeholder.
    """


DELETE_CONFIG_PATH = _DeleteConfigPath()


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
            field = lookup.get(str(key))
            canonical, nested, aliases = field or (str(key), None, ())
            path = (*prefix, canonical)
            if not isinstance(known, Mapping) or canonical not in known:
                # Validation dropped this path (unknown/removed field) — the
                # runtime ignores it, so disk must not carry it either.
                continue
            known_value = known[canonical]
            if (
                isinstance(value, Mapping)
                and isinstance(known_value, Mapping)
                and nested is not None
            ):
                # A nested BaseModel has schema-owned child fields, so preserve
                # the ordinary leaf-only walk through those children.
                walk(value, known_value, nested, path)
            elif isinstance(value, Mapping) and isinstance(known_value, Mapping) and field is None:
                # Schema-less callers retain the historical recursive helper
                # behavior. Config persistence always supplies a model class.
                walk(value, known_value, None, path)
            elif aliases:
                out.append((path, known_value, aliases))
            else:
                # A schema-owned Mapping (for example context-budget overrides)
                # is ONE normalized leaf. Its validator may canonicalize keys,
                # so walking raw submitted keys against the validated mapping
                # would drop aliases that changed spelling during validation.
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
    # them (port "3002" → 3002, enabled "true" → True). Compare the way YAML
    # itself would, so a typed placeholder is not flattened to a literal: a
    # plain str() comparison turns "true" vs True into a spurious difference.
    if resolved == new_value or resolved == str(new_value):
        return True
    if isinstance(new_value, bool):
        return resolved.strip().lower() in (
            ("true", "yes", "on") if new_value else ("false", "no", "off")
        )
    if isinstance(new_value, (int, float)):
        try:
            return type(new_value)(resolved.strip()) == new_value
        except (TypeError, ValueError):
            return False
    return False


def _assert_not_shared(node: Any, path: tuple[str, ...]) -> None:
    """Refuse to write through a YAML anchor/merge-shared mapping.

    ruamel round-trip keeps ONE object behind an anchor and every alias of it,
    so setting a key on ``<<: *defaults`` (or on an anchored section) silently
    rewrites every other section sharing it. That breaks the leaf-only contract
    in the least visible way possible, so this fails loudly instead and leaves
    the operator's file untouched.
    """
    anchor = getattr(node, "anchor", None)
    if anchor is not None and getattr(anchor, "value", None):
        raise ConfigPersistError(
            f"cannot safely edit '{'.'.join(path) or 'root'}': it is a YAML anchor "
            "shared with other sections — edit the config file directly"
        )
    if hasattr(node, "merge") and getattr(node, "merge", None):
        raise ConfigPersistError(
            f"cannot safely edit '{'.'.join(path) or 'root'}': it inherits from a "
            "YAML merge key shared with other sections — edit the config file directly"
        )


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
        # Atomic replacement creates a new inode. Preserve security-relevant
        # metadata rather than silently changing owner/group or dropping ACLs
        # and extended attributes. chown precedes copystat because chown can
        # clear set-id bits; copystat restores mode and supported xattrs.
        source_stat = os.stat(config_path, follow_symlinks=False)
        temp_stat = os.stat(tmp, follow_symlinks=False)
        if (temp_stat.st_uid, temp_stat.st_gid) != (
            source_stat.st_uid,
            source_stat.st_gid,
        ):
            try:
                os.chown(tmp, source_stat.st_uid, source_stat.st_gid)
            except PermissionError:
                raise ConfigPersistError(
                    "cannot preserve config file ownership during atomic write"
                ) from None
        shutil.copystat(config_path, tmp, follow_symlinks=False)
        os.chmod(tmp, orig_mode)
        # This is a new config revision; watchers must see a fresh mtime.
        os.utime(tmp, None, follow_symlinks=False)
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


def patch_config_paths(changes: Iterable[ConfigChange], *, path: Path | str | None = None) -> None:
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
        _assert_not_shared(node, ())
        for depth, segment in enumerate(segments[:-1]):
            child = node.get(segment) if hasattr(node, "get") else None
            if not isinstance(child, dict):
                # ruamel maps are dict subclasses; a plain dict inserted here
                # round-trips fine as a new block.
                child = {}
                node[segment] = child
            node = child
            _assert_not_shared(node, tuple(segments[: depth + 1]))
        leaf = segments[-1]
        # Write EVERY spelling the file already carries. Updating only one of a
        # canonical/legacy pair leaves the other stale, and pydantic's
        # validation_alias wins on reload — so the change would silently revert.
        # When the file has none of them, create the canonical key.
        present = [k for k in (leaf, *aliases) if hasattr(node, "get") and k in node]
        if value is DELETE_CONFIG_PATH:
            for target in present:
                del node[target]
            continue
        for target in present or [leaf]:
            if _placeholder_still_accurate(
                node.get(target) if hasattr(node, "get") else None, value
            ):
                # The file holds ${VAR} and the submitted value is just what that
                # placeholder already resolves to — a client that PUT back a whole
                # fetched document, not an operator changing anything. Keep the
                # placeholder; writing the resolved value would put the secret on
                # disk in plaintext.
                continue
            node[target] = value

    _dump_atomic(document, config_path, orig_mode)


async def _run_settled(write: Callable[[], None]) -> PersistOutcome:
    """Run a sync write to settlement; report result and cancellation.

    The dedicated worker thread communicates one explicit outcome through an
    asyncio Future. That keeps the real write exception available even when
    cancellation arrived first, and waiting for the thread to join keeps the
    caller inside the transaction until no write can escape it.
    """
    loop = asyncio.get_running_loop()
    outcome: asyncio.Future[BaseException | None] = loop.create_future()

    def worker() -> None:
        try:
            write()
        except BaseException as exc:
            loop.call_soon_threadsafe(outcome.set_result, exc)
        else:
            loop.call_soon_threadsafe(outcome.set_result, None)

    thread = threading.Thread(target=worker, name="odin-config-write", daemon=True)
    thread.start()
    was_cancelled = False
    while not outcome.done():
        try:
            await asyncio.shield(outcome)
        except asyncio.CancelledError:
            was_cancelled = True
    thread.join()
    return outcome.result(), was_cancelled


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
    loop = asyncio.get_running_loop()
    lock = _loop_locks.get(loop)
    if lock is None:
        lock = asyncio.Lock()
        _loop_locks[loop] = lock
    return lock


async def persist_config_paths_locked(
    changes: Iterable[ConfigChange], *, path: Path | str | None = None
) -> PersistOutcome:
    """Patch leaves to settlement while the caller holds the transaction.

    Returns ``(write_exception, was_cancelled)``. The caller publishes or
    restores runtime from the real write result, then re-raises cancellation.
    """
    changes = list(changes)
    if not changes:
        return None, False
    return await _run_settled(lambda: patch_config_paths(changes, path=path))


async def persist_config_paths(
    changes: Iterable[ConfigChange], *, path: Path | str | None = None
) -> None:
    """Patch leaves off the event loop, under the shared lock, to settlement."""
    changes = list(changes)
    if not changes:
        return
    async with config_transaction():
        exc, was_cancelled = await _run_settled(lambda: patch_config_paths(changes, path=path))
        if was_cancelled:
            raise asyncio.CancelledError
        if exc is not None:
            raise exc
