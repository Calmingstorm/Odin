"""One-time, provenance-gated config migrations.

Currently one migration: the legacy soft-compaction ceiling. For years the
shipped default was ``max_context_chars: 750_000`` and most persisted
configs materialized it verbatim. The context-budget campaign makes null
("auto", model-derived) the schema default — a stale materialized 750_000
would silently pin every install to the pre-campaign ceiling and defeat the
feature (settled design, 2026-08-17).

Mechanism — the "records migration completion" branch of the settled design:
``load_config`` never rewrites config.yml (the file may carry environment
placeholders and operator comments a YAML round-trip would destroy).
Instead the marker file under ``data/`` is a two-state provenance ledger for
the standing persisted value:

- value equals the legacy default EXACTLY and no marker exists → legacy
  provenance: interpret as auto in memory, log one WARNING, write the
  marker. The file itself is untouched.
- marker exists WITHOUT operator provenance → the standing 750_000 is still
  legacy: keep the auto interpretation, log at INFO (the file still says
  750_000, so the reinterpretation must never be silent).
- marker carries ``operator_saved`` → the persistence layer has since
  written the compression section deliberately: whatever the file says —
  including an intentional 750_000 — is honored verbatim, forever.

The save path never DELETES the marker (a bare deletion would make the
still-materialized 750_000 look legacy again on the next load); it stamps
operator provenance onto it. Hand-editors who want exactly 750_000 without
saving through the UI can stamp the marker themselves; every log line names
the file.

A marker-write failure degrades gracefully: the in-memory interpretation
still applies for this boot and the migration simply retries next boot.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from pathlib import Path

from .schema import LEGACY_MAX_CONTEXT_CHARS

log = logging.getLogger("odin.config")

LEGACY_CEILING_MARKER_NAME = "context_ceiling_migration.json"


def ceiling_marker_path(config_path: str | Path) -> Path:
    """Marker location: the ``data`` dir beside the config file."""
    return Path(config_path).resolve().parent / "data" / LEGACY_CEILING_MARKER_NAME


def apply_legacy_ceiling_migration(data: dict, config_path: str | Path) -> None:
    """Reinterpret a legacy-default soft-compaction ceiling as auto.

    Mutates the RAW config dict (pre-pydantic) in place. Only the exact
    legacy default is ever touched; any other explicit value — and a
    deliberate 750_000 whose marker carries operator provenance — passes
    through untouched.
    """
    codex = data.get("openai_codex")
    if not isinstance(codex, dict):
        return
    compression = codex.get("context_compression")
    if not isinstance(compression, dict):
        return
    if compression.get("max_context_chars") != LEGACY_MAX_CONTEXT_CHARS:
        return

    marker = ceiling_marker_path(config_path)
    if marker.exists():
        if _marker_has_operator_provenance(marker):
            # The compression section was deliberately saved at some point:
            # the persisted value is operator-authored, honor it verbatim.
            return
        compression["max_context_chars"] = None
        log.info(
            "max_context_chars %d carries legacy provenance; interpreting as "
            "auto (model-derived). Save the compression settings once to make "
            "an explicit value stick (provenance ledger: %s).",
            LEGACY_MAX_CONTEXT_CHARS,
            marker,
        )
        return

    compression["max_context_chars"] = None

    log.warning(
        "Migrated legacy max_context_chars %d to auto (model-derived). The "
        "config file is not modified; provenance is recorded at %s. Saving "
        "the compression settings makes any explicit value — including "
        "%d — stick permanently.",
        LEGACY_MAX_CONTEXT_CHARS,
        marker,
        LEGACY_MAX_CONTEXT_CHARS,
    )
    try:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(
            json.dumps(
                {
                    "migration": "legacy_max_context_chars_to_auto",
                    "legacy_value": LEGACY_MAX_CONTEXT_CHARS,
                    "migrated_at": datetime.now(UTC).isoformat(),
                },
                indent=2,
            )
        )
    except OSError as exc:
        log.warning(
            "Could not record the ceiling-migration marker at %s (%s); the "
            "auto interpretation still applies this boot and the migration "
            "retries next boot.",
            marker,
            exc,
        )


def _marker_has_operator_provenance(marker: Path) -> bool:
    try:
        recorded = json.loads(marker.read_text())
    except (OSError, ValueError):
        # Unreadable/corrupt marker: fail toward the legacy interpretation —
        # the conservative direction (auto), and the next deliberate save
        # rewrites the marker cleanly.
        return False
    return isinstance(recorded, dict) and bool(recorded.get("operator_saved"))


def record_ceiling_operator_provenance(config_path: str | Path) -> None:
    """Deliberate persistence of compression settings stamps operator provenance.

    Called by the config persistence layer whenever the compression section
    is written: from that moment the persisted value is operator-authored
    and must be honored verbatim on every future load — including a
    deliberate re-set of the legacy 750_000. The marker is stamped, never
    deleted: a bare deletion would make a still-materialized 750_000 look
    legacy again on the next load.
    """
    marker = ceiling_marker_path(config_path)
    try:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(
            json.dumps(
                {
                    "migration": "legacy_max_context_chars_to_auto",
                    "operator_saved": True,
                    "saved_at": datetime.now(UTC).isoformat(),
                },
                indent=2,
            )
        )
    except OSError as exc:
        log.warning(
            "Could not stamp operator provenance on %s: %s — a persisted "
            "legacy-equal ceiling may keep its auto interpretation.",
            marker,
            exc,
        )
