"""One-time config migrations.

Currently one: the legacy soft-compaction ceiling. For years the shipped
default was ``max_context_chars: 750_000`` and most persisted configs
materialized it verbatim. The context-budget campaign makes null ("auto",
model-derived) the schema default — a stale materialized 750_000 would
silently pin every install to the pre-campaign ceiling and defeat the
feature (plan of record R2, 2026-08-17).

Mechanism — the R2 primary branch: a genuine one-time ``750000 → null``
rewrite of the config file, through the persistence layer's surgical
comment/placeholder-preserving writer, gated by a completion marker:

- No marker + the file LITERALLY says ``750000`` (checked on the
  UNSUBSTITUTED text — a ``${VAR}`` placeholder that happens to resolve to
  750000 is deliberate operator configuration, never migrated): rewrite that
  one leaf to null, log ONE warning, record completion. The ambiguous
  standing value is gone from disk, so nothing can later mistake it for an
  explicit choice.
- No marker + any other value (null, absent, explicit, placeholder): record
  completion vacuously. This closes the fresh-install hole — an operator who
  later hand-writes ``750000`` is past the gate and honored verbatim.
- Marker present: the gate never fires again. Whatever the file says —
  including a deliberate post-migration ``750000`` — loads verbatim.

Failure honesty: if the rewrite cannot be persisted, the value is
interpreted as auto for THIS boot only, a warning says so, and NO completion
is recorded — the migration retries next boot. If the rewrite lands but the
marker write fails, the next boot takes the vacuous branch (the file no
longer says 750000) and self-heals the marker.

Paths on packaged installs: ``/opt/odin/config.yml`` is a symlink into
``/etc/odin``. The REWRITE resolves the symlink and patches the real target
(the atomic writer replaces its destination inode — writing the unresolved
path would sever the link). The MARKER deliberately does NOT resolve: the
durable data directory lives beside the symlink (``/opt/odin/data``), which
is what the data backup covers.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path

import yaml

from .schema import LEGACY_MAX_CONTEXT_CHARS

log = logging.getLogger("odin.config")

LEGACY_CEILING_MARKER_NAME = "context_ceiling_migration.json"

_CEILING_PATH = ("openai_codex", "context_compression", "max_context_chars")


def ceiling_marker_path(config_path: str | Path) -> Path:
    """Completion marker beside the config path AS GIVEN (symlink unresolved)."""
    return Path(config_path).absolute().parent / "data" / LEGACY_CEILING_MARKER_NAME


def _literal_ceiling_value(original_raw: str) -> object:
    """The ceiling value as WRITTEN in the file, before env substitution.

    Returns the parsed scalar (int for a literal number, str for a ``${VAR}``
    placeholder) or None when absent/unparseable — only an exact literal
    ``750000`` int qualifies as the legacy default.
    """
    try:
        node: object = yaml.safe_load(original_raw)
    except yaml.YAMLError:
        return None
    for segment in _CEILING_PATH:
        if not isinstance(node, dict):
            return None
        node = node.get(segment)
    return node


def _record_completion(marker: Path, reason: str) -> None:
    try:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(
            json.dumps(
                {
                    "migration": "legacy_max_context_chars_to_auto",
                    "reason": reason,
                    "completed_at": datetime.now(UTC).isoformat(),
                },
                indent=2,
            )
        )
    except OSError as exc:
        # Self-healing: after a successful rewrite the file no longer says
        # 750000, so the next boot records completion via the vacuous branch.
        log.warning(
            "Could not record ceiling-migration completion at %s: %s", marker, exc
        )


def apply_legacy_ceiling_migration(
    data: dict, config_path: str | Path, original_raw: str
) -> None:
    """Run the one-time legacy-ceiling migration gate.

    ``data`` is the substituted raw config dict (pre-pydantic), mutated in
    place only when the migration fires; ``original_raw`` is the file text
    BEFORE env substitution, used to distinguish a literal legacy default
    from a placeholder-resolved value.
    """
    marker = ceiling_marker_path(config_path)
    if marker.exists():
        return

    if _literal_ceiling_value(original_raw) != LEGACY_MAX_CONTEXT_CHARS:
        _record_completion(marker, reason="not_applicable")
        return

    try:
        # Resolve the symlink so the atomic replace lands on the real file
        # instead of severing a packaged /opt→/etc link. The surgical writer
        # preserves comments, ordering, and unrelated ${VAR} placeholders.
        from .persistence import patch_config_paths

        patch_config_paths(
            [(_CEILING_PATH, None)], path=Path(config_path).resolve()
        )
    except Exception as exc:  # noqa: BLE001 — boot must not die on migration I/O
        compression = data.get("openai_codex", {}).get("context_compression")
        if isinstance(compression, dict):
            compression["max_context_chars"] = None
        log.warning(
            "Could not rewrite legacy max_context_chars to auto (%s); "
            "interpreting as auto for this boot only — the migration retries "
            "next boot.",
            exc,
        )
        return

    compression = data.get("openai_codex", {}).get("context_compression")
    if isinstance(compression, dict):
        compression["max_context_chars"] = None
    log.warning(
        "Migrated legacy max_context_chars %d to auto (model-derived): the "
        "config file now records null for this setting. Completion recorded "
        "at %s; any explicit value set from now on — including %d — is "
        "honored verbatim.",
        LEGACY_MAX_CONTEXT_CHARS,
        marker,
        LEGACY_MAX_CONTEXT_CHARS,
    )
    _record_completion(marker, reason="migrated")
