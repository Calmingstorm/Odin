"""One-time configuration migrations.

The context-budget campaign changes the historical soft-compaction default
from a materialized ``max_context_chars: 750000`` to ``null`` (automatic,
model-derived).  This module performs that rewrite exactly once without
mistaking a later operator-authored 750000 for the shipped default.

Only the exact scalar shipped in config.yml qualifies.  YAML construction is
not evidence: it normalizes spellings such as ``750000.0``, ``0xB71B0``, and
``750_000`` to values equal to 750000.  The gate therefore checks the original
scalar's token, tag, and style.

Completion is a versioned, validated record under the unresolved config path's
sibling ``data`` directory.  Marker path existence alone proves nothing.  The
record is committed by temp-file write, file fsync, and atomic replacement.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import os
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import Enum
from pathlib import Path
from typing import Any

import yaml
from yaml.nodes import MappingNode, Node, ScalarNode

from .schema import LEGACY_MAX_CONTEXT_CHARS

log = logging.getLogger("odin.config")

LEGACY_CEILING_MARKER_NAME = "context_ceiling_migration.json"

_CEILING_PATH = ("openai_codex", "context_compression", "max_context_chars")
_MIGRATION_ID = "legacy_max_context_chars_to_auto"
_MARKER_VERSION = 3
_COMPLETION_REASONS = frozenset(
    {
        "migrated",
        "not_applicable",
        "prior_operator_saved",
        "upgraded_preversioned_completion",
    }
)


class MigrationCompletionError(RuntimeError):
    """The migration could not establish durable, unambiguous provenance."""


class _MarkerKind(Enum):
    MISSING = "missing"
    COMPLETE = "complete"
    ROUND1_LEGACY = "round1_legacy"
    ROUND1_OPERATOR = "round1_operator"
    PREVERSIONED_COMPLETE = "preversioned_complete"
    EMPTY = "empty"
    CORRUPT = "corrupt"
    DIRECTORY = "directory"
    UNKNOWN = "unknown"
    UNREADABLE = "unreadable"


@dataclass(frozen=True)
class _ScalarLexeme:
    value: str
    tag: str
    style: str | None
    token: str


def _config_identity(config_path: str | Path) -> str:
    """Stable identity for the config rewrite target.

    The canonical path survives atomic config replacement (unlike inode
    identity), makes symlink aliases rendezvous on one identity, and keeps two
    config files in one directory distinct.
    """
    target = Path(config_path).resolve()
    material = b"odin-config-identity-v1\0" + os.fsencode(str(target))
    return hashlib.sha256(material).hexdigest()


def ceiling_marker_path(config_path: str | Path) -> Path:
    """Return this config identity's marker in the unresolved data anchor."""
    launch = Path(config_path).absolute()
    return launch.parent / "data" / "config_migrations" / (
        f"{_MIGRATION_ID}.{_config_identity(config_path)}.json"
    )


def _legacy_ceiling_marker_path(config_path: str | Path) -> Path:
    """The pre-identity directory-wide marker, retained only for upgrade."""
    return Path(config_path).absolute().parent / "data" / LEGACY_CEILING_MARKER_NAME


def _shared_ceiling_marker_path(config_path: str | Path) -> Path:
    """Alias rendezvous marker beside the canonical rewrite target.

    Launch-local provenance remains in the durable data directory. This second
    identity-bound record is what lets aliases in different launch directories
    observe one completed migration.
    """
    target = Path(config_path).resolve()
    return target.parent / ".odin-data" / "config_migrations" / (
        f"{_MIGRATION_ID}.{_config_identity(config_path)}.json"
    )


def _mapping_value(node: Node, key: str) -> Node | None:
    """Return one unambiguous mapping value; duplicate keys prove nothing."""
    if not isinstance(node, MappingNode):
        return None
    matches = [
        value_node
        for key_node, value_node in node.value
        if isinstance(key_node, ScalarNode)
        and key_node.tag == "tag:yaml.org,2002:str"
        and key_node.value == key
    ]
    return matches[0] if len(matches) == 1 else None


def _literal_ceiling_lexeme(original_raw: str) -> _ScalarLexeme | None:
    """Return original token/tag/style evidence for the configured scalar."""
    try:
        node = yaml.compose(original_raw, Loader=yaml.SafeLoader)
    except yaml.YAMLError:
        return None
    if node is None:
        return None
    current: Node | None = node
    for segment in _CEILING_PATH:
        if current is None:
            return None
        current = _mapping_value(current, segment)
    if not isinstance(current, ScalarNode):
        return None
    return _ScalarLexeme(
        value=current.value,
        tag=current.tag,
        style=current.style,
        token=original_raw[current.start_mark.index : current.end_mark.index],
    )


def _is_shipped_legacy_literal(original_raw: str) -> bool:
    """Only the shipped implicit, unstyled, plain-decimal token qualifies."""
    scalar = _literal_ceiling_lexeme(original_raw)
    return bool(
        scalar is not None
        and scalar.value == str(LEGACY_MAX_CONTEXT_CHARS)
        and scalar.tag == "tag:yaml.org,2002:int"
        and scalar.style is None
        and scalar.token == str(LEGACY_MAX_CONTEXT_CHARS)
    )


def _is_utc_timestamp(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return False
    return parsed.tzinfo is not None and parsed.utcoffset() == timedelta(0)


def _classify_record(record: object) -> _MarkerKind:
    if not isinstance(record, dict):
        return _MarkerKind.UNKNOWN

    if set(record) == {
        "version",
        "migration",
        "config_id",
        "state",
        "reason",
        "completed_at",
    }:
        valid = (
            type(record["version"]) is int
            and record["version"] == _MARKER_VERSION
            and record["migration"] == _MIGRATION_ID
            and isinstance(record["config_id"], str)
            and len(record["config_id"]) == 64
            and record["state"] == "completed"
            and isinstance(record["reason"], str)
            and record["reason"] in _COMPLETION_REASONS
            and _is_utc_timestamp(record["completed_at"])
        )
        return _MarkerKind.COMPLETE if valid else _MarkerKind.UNKNOWN

    # Version 2 was validated but directory-wide. It can only be adopted when
    # found at the legacy launch-local path, never mistaken for an identity-
    # bound record at the new path.
    if set(record) == {
        "version",
        "migration",
        "state",
        "reason",
        "completed_at",
    }:
        valid = (
            type(record["version"]) is int
            and record["version"] == 2
            and record["migration"] == _MIGRATION_ID
            and record["state"] == "completed"
            and isinstance(record["reason"], str)
            and record["reason"] in _COMPLETION_REASONS
            and _is_utc_timestamp(record["completed_at"])
        )
        return _MarkerKind.PREVERSIONED_COMPLETE if valid else _MarkerKind.UNKNOWN

    # Round 1 recorded in-memory reinterpretation without rewriting config.yml.
    if set(record) == {"migration", "legacy_value", "migrated_at"}:
        valid = (
            record["migration"] == _MIGRATION_ID
            and type(record["legacy_value"]) is int
            and record["legacy_value"] == LEGACY_MAX_CONTEXT_CHARS
            and _is_utc_timestamp(record["migrated_at"])
        )
        return _MarkerKind.ROUND1_LEGACY if valid else _MarkerKind.UNKNOWN

    # Round 1 could also affirm that a compression save was operator-authored.
    if set(record) == {"migration", "operator_saved", "saved_at"}:
        valid = (
            record["migration"] == _MIGRATION_ID
            and record["operator_saved"] is True
            and _is_utc_timestamp(record["saved_at"])
        )
        return _MarkerKind.ROUND1_OPERATOR if valid else _MarkerKind.UNKNOWN

    # The first R2 implementation emitted this unversioned completion shape.
    if set(record) == {"migration", "reason", "completed_at"}:
        valid = (
            record["migration"] == _MIGRATION_ID
            and isinstance(record["reason"], str)
            and record["reason"] in {"migrated", "not_applicable"}
            and _is_utc_timestamp(record["completed_at"])
        )
        return _MarkerKind.PREVERSIONED_COMPLETE if valid else _MarkerKind.UNKNOWN

    return _MarkerKind.UNKNOWN


def _read_marker(marker: Path) -> _MarkerKind:
    try:
        raw = marker.read_text(encoding="utf-8")
    except FileNotFoundError:
        return _MarkerKind.MISSING
    except IsADirectoryError:
        return _MarkerKind.DIRECTORY
    except (OSError, UnicodeError):
        return _MarkerKind.UNREADABLE
    if not raw.strip():
        return _MarkerKind.EMPTY
    try:
        record: Any = json.loads(raw)
    except json.JSONDecodeError:
        return _MarkerKind.CORRUPT
    return _classify_record(record)


def _atomic_write_marker(marker: Path, record: dict[str, object]) -> None:
    """Commit one marker revision via temp-file, file fsync, and replace."""
    marker.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(record, indent=2, sort_keys=True) + "\n"
    fd, temporary_name = tempfile.mkstemp(
        dir=marker.parent,
        prefix=f".{marker.name}.",
        suffix=".tmp",
    )
    temporary = Path(temporary_name)
    stream = None
    try:
        os.fchmod(fd, 0o600)
        stream = os.fdopen(fd, "w", encoding="utf-8")
        fd = -1
        with stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        stream = None
        os.replace(temporary, marker)
    except BaseException:
        if stream is not None:
            with contextlib.suppress(OSError):
                stream.close()
        if fd >= 0:
            with contextlib.suppress(OSError):
                os.close(fd)
        with contextlib.suppress(OSError):
            temporary.unlink()
        raise

    # The replace is already committed.  Directory fsync is best effort on
    # filesystems that support it and cannot truthfully roll that commit back.
    with contextlib.suppress(OSError):
        directory_fd = os.open(marker.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)


def _completion_record(reason: str, config_id: str) -> dict[str, object]:
    return {
        "version": _MARKER_VERSION,
        "migration": _MIGRATION_ID,
        "config_id": config_id,
        "state": "completed",
        "reason": reason,
        "completed_at": datetime.now(UTC).isoformat(),
    }


def _write_required(marker: Path, reason: str, purpose: str, config_id: str) -> None:
    try:
        _atomic_write_marker(marker, _completion_record(reason, config_id))
    except OSError as exc:
        log.error("Could not %s at %s: %s", purpose, marker, exc)
        raise MigrationCompletionError(
            f"could not {purpose}; configuration was left unchanged"
        ) from exc


def _record_after_rewrite(marker: Path, config_id: str) -> None:
    try:
        _atomic_write_marker(marker, _completion_record("migrated", config_id))
    except OSError as exc:
        # The ambiguous value is already gone.  A later load takes the
        # non-legacy branch and safely retries this completion write.
        log.warning(
            "Could not record ceiling-migration completion at %s: %s; "
            "the rewritten config is safe and completion retries next boot.",
            marker,
            exc,
        )


def _read_identity_marker(marker: Path, config_id: str) -> _MarkerKind:
    kind = _read_marker(marker)
    if kind is not _MarkerKind.COMPLETE:
        return kind
    try:
        record = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return _MarkerKind.UNREADABLE
    return kind if record.get("config_id") == config_id else _MarkerKind.UNKNOWN


def _write_completion_pair(
    marker: Path,
    shared_marker: Path,
    reason: str,
    purpose: str,
    config_id: str,
) -> None:
    # Publish shared provenance first: once a launch-local marker says complete,
    # every alias must already have a canonical rendezvous record to consult.
    _write_required(shared_marker, reason, purpose, config_id)
    _write_required(marker, reason, purpose, config_id)


def _set_runtime_auto(data: dict) -> None:
    codex = data.get("openai_codex")
    if not isinstance(codex, dict):
        return
    compression = codex.get("context_compression")
    if isinstance(compression, dict):
        compression["max_context_chars"] = None


def apply_legacy_ceiling_migration(data: dict, config_path: str | Path, original_raw: str) -> None:
    """Apply the identity-bound one-time legacy-ceiling migration."""
    config_id = _config_identity(config_path)
    marker = ceiling_marker_path(config_path)
    shared_marker = _shared_ceiling_marker_path(config_path)
    marker_kind = _read_identity_marker(marker, config_id)
    shared_kind = _read_identity_marker(shared_marker, config_id)

    invalid = {
        _MarkerKind.EMPTY,
        _MarkerKind.CORRUPT,
        _MarkerKind.DIRECTORY,
        _MarkerKind.UNKNOWN,
        _MarkerKind.UNREADABLE,
    }
    for path, kind in ((marker, marker_kind), (shared_marker, shared_kind)):
        if kind in invalid:
            log.error(
                "Ceiling-migration record at %s is %s; refusing to guess at migration provenance.",
                path,
                kind.value,
            )
            raise MigrationCompletionError(
                "ceiling-migration record is invalid or unreadable; inspect it before retrying"
            )

    if marker_kind is _MarkerKind.COMPLETE and shared_kind is _MarkerKind.COMPLETE:
        return
    if shared_kind is _MarkerKind.COMPLETE:
        # A different symlink alias already completed this config identity.
        _write_required(
            marker,
            "upgraded_preversioned_completion",
            "record alias-local ceiling-migration completion",
            config_id,
        )
        return
    if marker_kind is _MarkerKind.COMPLETE:
        _write_required(
            shared_marker,
            "upgraded_preversioned_completion",
            "repair shared ceiling-migration completion",
            config_id,
        )
        return
    if marker_kind in {
        _MarkerKind.ROUND1_OPERATOR,
        _MarkerKind.PREVERSIONED_COMPLETE,
    }:
        reason = (
            "prior_operator_saved"
            if marker_kind is _MarkerKind.ROUND1_OPERATOR
            else "upgraded_preversioned_completion"
        )
        _write_completion_pair(
            marker,
            shared_marker,
            reason,
            "upgrade the ceiling-migration completion record",
            config_id,
        )
        return
    if marker_kind is _MarkerKind.ROUND1_LEGACY:
        log.info("Upgrading round-1 legacy migration provenance at %s.", marker)

    # Upgrade the old launch-directory marker only when no identity-bound marker
    # exists. Its provenance remains fail-closed, but it no longer suppresses a
    # distinct config in the same directory once one identity has been bound.
    # A legacy marker plus any new identity marker is an already-upgraded
    # directory; sibling identities must not inspect or inherit the old record.
    legacy_marker = _legacy_ceiling_marker_path(config_path)
    identity_dir = marker.parent
    identity_markers_exist = False
    try:
        identity_markers_exist = identity_dir.is_dir() and any(identity_dir.iterdir())
    except OSError as exc:
        raise MigrationCompletionError(
            "could not inspect identity-bound ceiling-migration records"
        ) from exc
    legacy_kind = (
        _MarkerKind.MISSING if identity_markers_exist else _read_marker(legacy_marker)
    )
    if legacy_kind is _MarkerKind.COMPLETE:
        # A v3 legacy-path record is already bound. A different config in the
        # same launch directory must ignore it rather than inherit completion.
        try:
            legacy_record = json.loads(legacy_marker.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            legacy_kind = _MarkerKind.UNREADABLE
        else:
            if legacy_record.get("config_id") != config_id:
                legacy_kind = _MarkerKind.MISSING
    if legacy_kind in invalid:
        raise MigrationCompletionError(
            "legacy ceiling-migration record is invalid or unreadable; inspect it before retrying"
        )
    if legacy_kind in {
        _MarkerKind.COMPLETE,
        _MarkerKind.ROUND1_OPERATOR,
        _MarkerKind.PREVERSIONED_COMPLETE,
    }:
        reason = (
            "prior_operator_saved"
            if legacy_kind is _MarkerKind.ROUND1_OPERATOR
            else "upgraded_preversioned_completion"
        )
        _write_completion_pair(marker, shared_marker, reason,
                               "upgrade the ceiling-migration completion record", config_id)
        # Bind the previously directory-wide provenance to the one config that
        # adopted it. Later sibling configs can no longer inherit it.
        _write_required(
            legacy_marker,
            reason,
            "bind legacy ceiling-migration completion to its config",
            config_id,
        )
        return
    if legacy_kind is _MarkerKind.ROUND1_LEGACY:
        log.info("Upgrading round-1 legacy migration provenance at %s.", legacy_marker)

    if not _is_shipped_legacy_literal(original_raw):
        _write_completion_pair(marker, shared_marker, "not_applicable",
                               "record vacuous ceiling-migration completion", config_id)
        return

    try:
        from .persistence import patch_config_paths

        patch_config_paths([(_CEILING_PATH, None)], path=Path(config_path).resolve())
    except Exception as exc:  # noqa: BLE001 — boot retains safe runtime behavior
        _set_runtime_auto(data)
        log.warning(
            "Could not rewrite legacy max_context_chars to auto (%s); "
            "interpreting as auto for this boot only — the migration retries next boot.",
            exc,
        )
        return

    _set_runtime_auto(data)
    log.warning(
        "Migrated legacy max_context_chars %d to auto (model-derived): the "
        "config file now records null. Any later explicit value — including "
        "%d — is honored verbatim.",
        LEGACY_MAX_CONTEXT_CHARS,
        LEGACY_MAX_CONTEXT_CHARS,
    )
    # Shared first, then launch-local. Failure after rewrite is self-healing:
    # the unambiguous null takes the vacuous branch on the next boot.
    _record_after_rewrite(shared_marker, config_id)
    _record_after_rewrite(marker, config_id)
